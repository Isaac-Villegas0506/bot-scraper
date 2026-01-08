# 🤖 Bot Scraper RUT Chile

Bot de web scraping para consultar datos de RUT chileno desde nombrerutyfirma.com

## 🚀 Despliegue en Railway

### Pasos:

1. **Crear cuenta en Railway**: [railway.app](https://railway.app)

2. **Subir a GitHub**:
   ```bash
   cd bot-scraper
   git init
   git add .
   git commit -m "Bot scraper inicial"
   git remote add origin https://github.com/TU_USUARIO/rut-scraper-bot.git
   git push -u origin main
   ```

3. **Conectar en Railway**:
   - Click en "New Project"
   - Selecciona "Deploy from GitHub repo"
   - Elige tu repositorio
   - Railway lo desplegará automáticamente

4. **Obtener URL**:
   - Una vez desplegado, ve a "Settings" > "Networking"
   - Genera un dominio público (ej: `rut-scraper-bot.up.railway.app`)

## 📡 Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Info del servicio |
| GET | `/health` | Estado del servicio |
| GET | `/validar/:rut` | Validar formato RUT |
| GET | `/consulta/:rut` | Consultar datos por RUT |
| POST | `/consulta` | Consultar datos (body: { rut }) |

## 📝 Ejemplos

### Consultar RUT:
```bash
curl https://TU-URL.railway.app/consulta/12345678-9
```

### Respuesta exitosa:
```json
{
  "success": true,
  "data": {
    "rut": "12345678-9",
    "nombre": "JUAN PEREZ GONZALEZ",
    "sexo": "Masculino",
    "direccion": "AV. EJEMPLO 123",
    "comuna": "SANTIAGO",
    "region": "METROPOLITANA"
  }
}
```

## ⚙️ Desarrollo Local

```bash
npm install
npm start
```

El servidor correrá en `http://localhost:3000`

## 📋 Notas

- El bot usa Puppeteer para scraping
- Railway proporciona el entorno con Chrome
- El plan gratuito de Railway tiene límites de uso
