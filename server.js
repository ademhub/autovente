require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

const DATA_FILE = path.join(__dirname, 'data', 'cars.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function readCars() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeCars(cars) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(cars, null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  }
});

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    cb(null, ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase()));
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/cars', (req, res) => {
  const cars = readCars().sort((a, b) => b.dateAjout - a.dateAjout);
  res.json(cars);
});

const scanUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    cb(null, ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase()));
  }
}).array('images', 6);

const SCAN_PROMPT = `Regarde ces photos d'une meme voiture (exterieur, interieur, tableau de bord si presents) et identifie-la avec ses caracteristiques visibles.
Reponds uniquement avec un objet JSON de cette forme exacte, sans texte autour :
{"marque": "...", "modele": "...", "annee": "...", "carburant": "Essence|Diesel|Hybride|Electrique|GPL|Inconnu", "transmission": "Manuelle|Automatique|Inconnu", "description": "...", "confiance": "haute|moyenne|basse"}
- "description" : 1 a 3 phrases en francais decrivant les caracteristiques visibles (couleur, type de carrosserie, etat apparent, equipements visibles comme jantes alu, toit ouvrant, etc). Ne pas inventer d'informations non visibles.
- Utilise "Inconnu" pour carburant/transmission si tu ne peux pas le determiner avec certitude a partir des photos, plutot que de deviner. Idem pour annee/description : laisse vide plutot que d'inventer.
- Si ce n'est pas une voiture, renvoie toutes les chaines vides et confiance "basse".`;

app.post('/api/scan-car', scanUpload, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(400).json({
      error: "Reconnaissance non configuree : ajoutez une cle GEMINI_API_KEY gratuite (aistudio.google.com/apikey) dans le fichier .env, puis redemarrez le serveur."
    });
  }
  if (!req.files || !req.files.length) {
    return res.status(400).json({ error: 'Aucune image recue.' });
  }

  try {
    const imageParts = req.files.map(f => ({
      inline_data: { mime_type: f.mimetype, data: f.buffer.toString('base64') }
    }));

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: SCAN_PROMPT }, ...imageParts]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                marque: { type: 'STRING' },
                modele: { type: 'STRING' },
                annee: { type: 'STRING' },
                carburant: { type: 'STRING', enum: ['Essence', 'Diesel', 'Hybride', 'Electrique', 'GPL', 'Inconnu'] },
                transmission: { type: 'STRING', enum: ['Manuelle', 'Automatique', 'Inconnu'] },
                description: { type: 'STRING' },
                confiance: { type: 'STRING', enum: ['haute', 'moyenne', 'basse'] }
              },
              required: ['marque', 'modele', 'confiance']
            }
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      return res.status(502).json({ error: 'Erreur du service de reconnaissance: ' + (errBody.error?.message || geminiRes.statusText) });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({ error: 'Reponse inattendue du service de reconnaissance.' });
    }

    const result = JSON.parse(text);
    res.json({
      marque: result.marque || '',
      modele: result.modele || '',
      annee: result.annee || '',
      carburant: result.carburant === 'Electrique' ? 'Électrique' : (result.carburant === 'Inconnu' ? '' : result.carburant || ''),
      transmission: result.transmission === 'Inconnu' ? '' : (result.transmission || ''),
      description: result.description || '',
      confiance: result.confiance || 'basse'
    });
  } catch {
    res.status(502).json({ error: 'Impossible de contacter le service de reconnaissance.' });
  }
});

const STATUTS = new Set(['disponible', 'en_attente', 'vendu']);

function parseCarFields(body) {
  const { vendeur, marque, modele, annee, kilometrage, carburant, transmission, prix, description, note, statut } = body;
  return {
    vendeur: vendeur ? String(vendeur).trim() : '',
    marque: marque ? String(marque).trim() : '',
    modele: modele ? String(modele).trim() : '',
    annee: annee ? Number(annee) : null,
    kilometrage: kilometrage ? Number(kilometrage) : null,
    carburant: carburant ? String(carburant).trim() : '',
    transmission: transmission ? String(transmission).trim() : '',
    prix: prix ? Number(prix) : null,
    description: description ? String(description).trim() : '',
    note: note ? String(note).trim() : '',
    statut: STATUTS.has(statut) ? statut : 'disponible'
  };
}

app.post('/api/cars', upload.array('images', 10), (req, res) => {
  const fields = parseCarFields(req.body);

  if (!fields.vendeur || !fields.marque || !fields.modele || !fields.prix) {
    return res.status(400).json({ error: 'Champs obligatoires manquants (vendeur, marque, modele, prix).' });
  }

  const car = {
    id: crypto.randomUUID(),
    ...fields,
    images: (req.files || []).map(f => '/uploads/' + f.filename),
    dateAjout: Date.now()
  };

  const cars = readCars();
  cars.push(car);
  writeCars(cars);
  res.status(201).json(car);
});

app.put('/api/cars/:id', upload.array('images', 10), (req, res) => {
  const cars = readCars();
  const car = cars.find(c => c.id === req.params.id);
  if (!car) return res.status(404).json({ error: 'Annonce introuvable.' });

  const fields = parseCarFields(req.body);
  if (!fields.vendeur || !fields.marque || !fields.modele || !fields.prix) {
    return res.status(400).json({ error: 'Champs obligatoires manquants (vendeur, marque, modele, prix).' });
  }

  let images = car.images;
  const removeImages = req.body.removeImages;
  if (removeImages) {
    const toRemove = new Set(String(removeImages).split(',').filter(Boolean));
    images = images.filter(img => !toRemove.has(img));
    for (const img of toRemove) {
      fs.unlink(path.join(__dirname, 'public', img), () => {});
    }
  }
  images = images.concat((req.files || []).map(f => '/uploads/' + f.filename));

  Object.assign(car, fields, { images });
  writeCars(cars);
  res.json(car);
});

app.patch('/api/cars/:id/statut', (req, res) => {
  const { statut } = req.body;
  if (!STATUTS.has(statut)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }

  const cars = readCars();
  const car = cars.find(c => c.id === req.params.id);
  if (!car) return res.status(404).json({ error: 'Annonce introuvable.' });

  car.statut = statut;
  writeCars(cars);
  res.json(car);
});

app.delete('/api/cars/:id', (req, res) => {
  const cars = readCars();
  const car = cars.find(c => c.id === req.params.id);
  if (!car) return res.status(404).json({ error: 'Annonce introuvable.' });

  for (const img of car.images) {
    const filePath = path.join(__dirname, 'public', img);
    fs.unlink(filePath, () => {});
  }

  writeCars(cars.filter(c => c.id !== req.params.id));
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Site de gestion de vente de voitures lance sur http://localhost:${PORT}`);
});
