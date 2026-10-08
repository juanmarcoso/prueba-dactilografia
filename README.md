# Software Dactilográfico

Aplicación local para practicar dactilografía (mecanografía): muestra textos de práctica, mide velocidad y precisión por ejercicio, guarda el historial en una base local y muestra un dashboard con gráficas de evolución.

## Características

- **Práctica**: texto aleatorio, campo de escritura con cronómetro y corrección visual palabra por palabra.
- **Resultados**: velocidad (palabras por minuto, PPM) y precisión calculadas automáticamente.
- **Aprobación**: un intento se considera aprobado al superar las 100 palabras correctas por intento.
- **Dashboard**: tasa de aprobación, último intento, métricas (mejor resultado, precisión, velocidad, intentos totales), gráfico de evolución (Chart.js) y tabla de historial con filtros de 30/90/365 días.
- **Admin de Django**: gestión de textos y resultados desde `/admin/`.
- **Sin dependencias externas en el navegador**: Bootstrap 5.3.3 y Chart.js 4.4.1 están vendorizados en `frontend/vendor/`, por lo que funciona sin conexión a internet.

## Stack tecnológico

- **Backend**: Python 3.14 (compatible 3.11+), Django 6.1, django-cors-headers, python-dotenv, SQLite.
- **Frontend**: HTML, CSS y JavaScript vanilla; Bootstrap 5.3.3 y Chart.js 4.4.1 localizados en `frontend/vendor/`.
- **Tests**: Django TestCase (backend) y jsdom/Node (frontend).

## Estructura del proyecto

```
Software_dactilografico/
├── package.json              # script "dev" (npm run dev)
├── scripts/
│   └── dev-server.js         # servidor estático de desarrollo (puerto 5500)
├── .gitignore
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── backend/
│   ├── .env.example          # plantilla de variables de entorno
│   ├── requirements.txt
│   ├── manage.py
│   ├── config/               # configuración de Django (settings, urls, wsgi)
│   └── typing_app/           # app: modelos, vistas, urls y tests
└── frontend/
    ├── index.html            # vista de práctica
    ├── dashboard.html        # dashboard de resultados
    ├── css/                  # estilos (styles.css, dashboard.css)
    ├── js/                   # api.js, practice.js, dashboard.js
    ├── vendor/               # bootstrap y chart.js locales
    └── tests/                # pruebas jsdom (frontend)
```

Django sirve el frontend en desarrollo: `/` muestra la práctica y `/dashboard.html` el dashboard.

## Requisitos

- Python 3.11 o superior (probado con 3.14).
- Node.js 18+ y npm (solo para las pruebas del frontend).
- No se necesita internet si se usa el frontend servido por Django (con `migrate` se siembran 6 textos de práctica).

## Inicialización

```bash
# 1. Crear y activar el entorno virtual
python3 -m venv backend/venv
source backend/venv/bin/activate

# 2. Instalar dependencias
pip install -r backend/requirements.txt

# 3. Variables de entorno (opcional; hay valores por defecto de desarrollo)
cp backend/.env.example backend/.env

# 4. Crear la base de datos (siembra 6 textos de práctica)
python backend/manage.py migrate

# 5. Arrancar el servidor
python backend/manage.py runserver
```

Abre `http://127.0.0.1:8000/` (práctica) y `http://127.0.0.1:8000/dashboard.html` (dashboard).

### Notas para Windows

```text
python -m venv backend\venv
backend\venv\Scripts\activate
pip install -r backend\requirements.txt
cp backend\.env.example backend\.env
python backend\manage.py migrate
python backend\manage.py runserver
```

### Frontend en desarrollo (opcional): `npm run dev`

El frontend también puede servirse de forma independiente con Node (sin instalar dependencias):

```bash
npm run dev
```

Arranca un servidor estático en `http://127.0.0.1:5500/` que sirve `frontend/`. Requiere el backend corriendo en `http://127.0.0.1:8000` (`python backend/manage.py runserver`) para que la API y el guardado de resultados funcionen. El puerto se cambia con `npm run dev -- --port 8080` o la variable `PORT`.

### Inicialización con rama de trabajo

Si vas a contribuir, consulta [CONTRIBUTING.md](CONTRIBUTING.md) (usar un fork, crear una rama desde `main`, correr los tests y abrir un pull request).

## Uso

1. En `/`, pulsa **Nuevo texto/Empieza** y escribe el texto que se muestra. El cronómetro inicia con la primera tecla.
2. Al terminar, el intento se guarda y se muestra tu velocidad, precisión y si apruebas el umbral de 100 palabras correctas.
3. En **Dashboard** (cabecera) revisa tus métricas, el gráfico de evolución y el historial con filtros por periodo.
4. La sección `/admin/` permite gestionar textos y resultados (crea un superusuario con `python backend/manage.py createsuperuser`).

## API

Base: `http://127.0.0.1:8000/api`. Todas las llamadas deben enviar `Content-Type: application/json`. Los `POST` requieren la cookie `csrftoken` (se envía al llamar a `GET /api/text/random/`) y la cabecera `X-CSRFToken`.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| GET | `/api/text/random/` | Texto de práctica aleatorio con su `id`, `title`, `content` y `word_count`. |
| POST | `/api/results/` | Guarda un intento y devuelve el resultado guardado (201). |
| GET | `/api/stats/?days=30` | Resumen de estadísticas; `days` admite 30, 90 o 365. |

Ejemplo de payload para `POST /api/results/`:

```json
{
  "text_id": 1,
  "wpm": 46.8,
  "precision_percentage": 91.5,
  "duration_seconds": 120,
  "total_words_typed": 100,
  "correct_words": 91
}
```

- `wpm` y `precision_percentage` se calculan si no se envían.
- `duration_seconds` (o `duration_minutes`) es obligatorio.
- Validaciones: `correct_words` no puede superar `total_words_typed` ni la precisión superar 100.

Respuesta de `POST /api/results/`:

```json
{
  "id": 1,
  "date": "2026-10-08T00:00:00+00:00",
  "duration_minutes": 2,
  "correct_words": 91,
  "total_words_typed": 100,
  "precision_percentage": 91.5,
  "wpm": 46.8,
  "passed": false,
  "text_snippet": { "id": 1, "title": "..." }
}
```

Respuesta de `GET /api/stats/?days=30` (resumida):

```json
{
  "total_results": 6,
  "passed_count": 4,
  "averages": { "wpm": 46.8, "precision_percentage": 86.5, "duration_minutes": 2.3, "correct_words": 82.2, "total_words_typed": 90.7 },
  "best": { "id": 3, "date": "...", "wpm": 55.5, "precision_percentage": 90.9, "correct_words": 130 },
  "best_precision": { "...": "..." },
  "max_correct_words": 130,
  "last_practice": { "id": 6, "date": "...", "wpm": 42, "precision_percentage": 75, "correct_words": 60 },
  "passed_threshold": 100,
  "period": { "days": 30, "start": "...", "count": 4 },
  "results": [ { "...": "resultados ordenados por fecha ascendente" } ]
}
```

### Configuración CORS/CSRF (desarrollo)

Para servir el frontend desde un servidor estático distinto (p. ej. `npm run dev` en el puerto 5500 o Live Server), `LOCAL_DEV_ORIGINS` ya permite orígenes de `127.0.0.1` y `localhost` en los puertos 8000, 5500, 5173, 4173, 3000, 4200, 8080 y 8888.

## Tests

```bash
# Backend (Django TestCase)
python backend/manage.py test typing_app

# Frontend (jsdom; 102 comprobaciones: 49 práctica + 53 dashboard)
cd frontend/tests/
npm install
npm test
```

## Variables de entorno

El backend lee el archivo `backend/.env` si existe. Sin él, usa valores de desarrollo. El archivo `.env` **no debe subirse al repositorio** (está en `.gitignore`); se commitea la plantilla `.env.example`.

| Variable | Valor por defecto | Descripción |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | clave de desarrollo | Clave secreta de Django. Usa una cadena aleatoria larga en producción. |
| `DJANGO_DEBUG` | `true` | `true` en desarrollo; `0` o `false` desactiva el modo debug. |
| `DJANGO_ALLOWED_HOSTS` | `127.0.0.1,localhost` | Hosts permitidos, separados por comas. |

## Políticas de uso y licencia

- **Licencia**: GPL-3.0. Puedes usar, estudiar, modificar y distribuir el software, pero los trabajos derivados deben distribuirse bajo la misma licencia (copyleft). El texto oficial completo está en [LICENSE](LICENSE).
- **Datos locales**: este software no envía datos a terceros ni incluye telemetría; tus intentos se guardan solo en la base SQLite local (`backend/db.sqlite3`). Si en el futuro se añadiera algún envío de datos o analítica, se deberá informar con claridad y pedir consentimiento.
- **Textos de práctica**: los textos sembrados son originales. Si importas textos de terceros, verifica su licencia; evita contenido con copyright y prefiere dominio público o licencias CC-BY/CC0.
- **Sin garantías**: el software se ofrece "tal cual", sin garantías de ningún tipo, según los términos del [LICENSE](LICENSE).
- **Uso educativo y menores**: si lo usas en aulas o con menores, gestiona los datos personales con el consentimiento correspondiente y según la normativa aplicable (p. ej. LOPDGDD/GDPR).
- **Si lo publicas en internet**: antes de exponerlo, desactiva `DJANGO_DEBUG` (`DJANGO_DEBUG=0`), define una `DJANGO_SECRET_KEY` real y revisa `DJANGO_ALLOWED_HOSTS` y el uso de HTTPS. Revisa también las secciones de seguridad de la documentación de Django.

## Contribuir

Consulta [CONTRIBUTING.md](CONTRIBUTING.md): incluye el flujo de pull requests contra `main`, convenciones de commits y el checklist antes de enviar un PR.