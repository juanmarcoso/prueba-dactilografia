# Guía de contribución

Gracias por colaborar en este proyecto. Esta guía describe cómo contribuir con código o ideas mediante pull requests (PR) hacia la rama `main`.

## Flujo de trabajo

1. **Abre un issue** (opcional pero recomendado) para discutir el cambio antes de escribir código: describe qué haces, por qué y cómo lo probarías.
2. **Forkea** el repositorio y clona tu copia.
3. **Mantente al día con `main`** y crea una rama de trabajo desde ella:

   ```bash
   git remote add upstream https://github.com/USUARIO/Software_dactilografico.git
   git fetch upstream
   git checkout -b feature/descripcion-corta upstream/main
   ```

   Convención de nombres de rama:

   - `feature/...` para funcionalidades nuevas.
   - `fix/...` para correcciones de errores.
   - `docs/...` para documentación.
   - `refactor/...` para reestructuraciones sin cambio de comportamiento.

4. **Desarrolla** siguiendo las normas de estilo de más abajo.
5. **Corre los tests** (ver [Ejecución de tests](#ejecucion-de-tests)) y verifica que no se rompa nada.
6. **Haz commits** con la convención indicada abajo.
7. **Haz push** a tu fork y **abre un PR contra `main`** usando la plantilla de descripción.
8. Espera la **revisión**: al menos una aprobación antes de fusionar. Cuando se acepte, se fusionará con *squash* (un solo commit en `main`).

> No se aceptan PRs que incluyan `.env`, `backend/db.sqlite3`, `venv/`, `node_modules/` u otros archivos ignorados. Revisa el resultado de `git status` antes de abrir el PR.

## Ejecución de tests

```bash
# Backend
python backend/manage.py test typing_app

# Frontend (jsdom)
cd frontend/tests/
npm install
npm test
```

Comprueba también el chequeo del proyecto: `python backend/manage.py check`. Antes de abrir el PR, pega en la descripción el resultado de los tests.

## Normas de estilo

- **Backend (Django/Python)**: sigue la convención de proyectos Django (PEP 8). Usa docstrings solo cuando aporten claridad; no añadas comentarios triviales.
- **Frontend**: JavaScript vanilla sin dependencias nuevas. No añadas comentarios al código. Los textos de la interfaz van en español.
- **Bibliotecas**: si necesitas Bootstrap, Chart.js o jsdom, usa las versiones ya vendorizadas/dependencias existentes. No agregues CDNs.
- **Validación**: cada PR debe pasar `manage.py test typing_app`, `manage.py check` y, si toca frontend, `npm test`.

## Convención de commits

Usa [Conventional Commits](https://www.conventionalcommits.org/), con el mensaje en inglés y en tiempo imperativo:

- `feat: add keyboard shortcut for restart`
- `fix: correct word color after backspace`
- `docs: expand API section`
- `test: cover empty stats period`
- `refactor: extract chart building`
- `chore: bump python-dotenv`

## Plantilla de descripción de PR

```markdown
## Qué cambia

Breve resumen de los cambios.

## Por qué

Motivación o issue relacionado (#ID).

## Cómo probarlo

Pasos para verificar el cambio y salida de los tests.
```

## Consejos para abrir un buen issue

- Indica el **comportamiento esperado** frente al **actual**.
- Aporta **pasos para reproducir** y la salida de errores.
- Etiqueta si es bug, mejora o pregunta.