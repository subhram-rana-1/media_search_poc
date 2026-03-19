# Media Search POC

A Next.js fullstack POC for comparing different media search backends.

## Architecture

The app uses the **Strategy Pattern** — each search approach implements a common `IPocModel` interface and is registered in a central registry. The API layer selects the implementation at request time based on the `pocModel` parameter.

```
POST /api/search  { pocModel, tags[] }  →  MediaResult[]
POST /api/seed    { model? }            →  seed results
```

### Supported POC Models

| Model | `pocModel` value | Description |
|---|---|---|
| MariaDB Only | `mariadb-only` | SQL tag matching with weighted scoring |
| MariaDB + Qdrant | `mariadb-qdrant` | Vector similarity search |
| MariaDB + Elasticsearch | `mariadb-elastic` | Full-text nested tag search |

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── search/route.ts       # POST /api/search
│   │   └── seed/route.ts         # POST /api/seed
│   ├── page.tsx                  # Frontend UI
│   ├── layout.tsx
│   └── globals.css
├── database/
│   ├── clients/
│   │   ├── mariadb.ts            # MariaDB connection pool
│   │   ├── qdrant.ts             # Qdrant client
│   │   └── elasticsearch.ts      # Elasticsearch client
│   ├── schemas/
│   │   ├── mariadb-only/schema.sql
│   │   ├── mariadb-qdrant/schema.sql
│   │   └── mariadb-elastic/schema.sql
│   └── seed/
│       ├── seed-data.json        # Sample media data
│       └── seeder.ts             # Seeding logic
├── poc-models/
│   ├── base.ts                   # IPocModel interface
│   ├── mariadb-only.model.ts
│   ├── mariadb-qdrant.model.ts
│   ├── mariadb-elastic.model.ts
│   └── registry.ts               # Model registry
└── types/
    └── index.ts                  # Shared TypeScript types/enums
```

---

## Setup

### 1. Copy and configure environment

```bash
cp .env.example .env.local
# Edit .env.local with your DB connection details
```

### 2. Set up MariaDB

Start MariaDB and create the database + tables for the models you want to test:

```bash
# mariadb-only
mysql -u root -p < src/database/schemas/mariadb-only/schema.sql

# mariadb-qdrant
mysql -u root -p < src/database/schemas/mariadb-qdrant/schema.sql

# mariadb-elastic
mysql -u root -p < src/database/schemas/mariadb-elastic/schema.sql
```

### 3. Start optional backends

**Qdrant** (Docker):
```bash
docker run -p 6333:6333 qdrant/qdrant
```

**Elasticsearch** (Docker):
```bash
docker run -p 9200:9200 -e "discovery.type=single-node" -e "xpack.security.enabled=false" elasticsearch:8.13.0
```

### 4. Install dependencies and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Using the App

1. **Select a POC Model** — pick which backend to use
2. **Seed data** — click the "Seed" button to populate that model's database with sample data
3. **Add search tags** — fill in tag name, type, value/values, and weight
4. **Search** — click Search to run the query and see results with scores

---

## API Reference

### POST /api/search

**Request body:**
```json
{
  "pocModel": "mariadb-only",
  "tags": [
    {
      "name": "category",
      "type": "FIXED",
      "value": "nature",
      "values": ["nature", "landscape"],
      "weight": "HIGH"
    }
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "mediaUrl": "https://...",
      "score": 3.092,
      "matchedTags": ["category"]
    }
  ],
  "pocModel": "mariadb-only",
  "durationMs": 12
}
```

### POST /api/seed

**Request body (optional):**
```json
{ "model": "mariadb-only" }
```
Omit `model` to seed all registered models.

---

## Seed Data Format (`src/database/seed/seed-data.json`)

```json
[
  {
    "mediaUrl": "https://...",
    "visualQaScore": 0.92,
    "tags": [
      {
        "name": "category",
        "type": "FIXED",
        "value": "nature",
        "values": ["nature", "landscape"],
        "confidenceLevel": "HIGH"
      }
    ]
  }
]
```

---

## Adding a New POC Model

1. Add a new value to `PocModelType` in `src/types/index.ts`
2. Create `src/poc-models/my-model.model.ts` implementing `IPocModel`
3. Optionally add a DB client in `src/database/clients/`
4. Add a schema in `src/database/schemas/my-model/`
5. Register in `src/poc-models/registry.ts`

No other changes needed — the API and frontend automatically pick it up.
