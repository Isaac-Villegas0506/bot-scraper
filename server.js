const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

function formatRut(rut) {
    let cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    if (cleaned.length < 2) return null;
    const dv = cleaned.slice(-1);
    const numbers = cleaned.slice(0, -1);
    return `${numbers}-${dv}`;
}

function validateRut(rut) {
    const cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    if (cleaned.length < 8 || cleaned.length > 9) return false;
    const body = cleaned.slice(0, -1);
    const dv = cleaned.slice(-1);
    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i]) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const remainder = sum % 11;
    const calculatedDv = remainder === 0 ? '0' : remainder === 1 ? 'K' : String(11 - remainder);
    return dv === calculatedDv;
}

async function scrapeRutificador(rut) {
    const formattedRut = formatRut(rut);
    if (!formattedRut) {
        return { success: false, error: 'RUT inválido' };
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080',
                '--disable-blink-features=AutomationControlled' // Importante para evadir detección
            ]
        });

        const page = await browser.newPage();

        // Evasión básica de detección
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'es-ES,es;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
        });

        // Navegar a la nueva URL
        await page.goto('https://rutificador.net/rut/', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Esperar al input #rut
        await page.waitForSelector('input#rut', { timeout: 15000 });

        // Escribir el RUT (el sitio lo formatea automáticamente, enviamos sin puntos por si acaso)
        // El sitio usa un script que formatea, así que escribimos lento para que funcione su JS
        await page.type('input#rut', rut, { delay: 150 });

        // Click en buscar
        await page.click('button#btn-buscar');

        // Esperar un poco para que la petición AJAX inicie
        await new Promise(r => setTimeout(r, 2000));

        // Esperar a que la tabla de resultados aparezca o un mensaje de error
        try {
            // Aumentamos el timeout a 20s para conexiones más lentas
            await page.waitForSelector('#tabla-resultados tbody tr td', { timeout: 20000 });
        } catch (e) {
            // Diagnóstico: Obtener qué hay en la página si falla
            const pageTitle = await page.title();
            const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500).replace(/\n/g, ' '));

            return {
                success: false,
                error: `Timeout. Título: "${pageTitle}". Texto visible: "${bodyText}..."`,
                rut: formattedRut
            };
        }

        const data = await page.evaluate(() => {
            const row = document.querySelector('#tabla-resultados tbody tr');
            if (!row) return null;

            const cells = row.querySelectorAll('td');
            if (cells.length < 6) return null; // Esperamos 6 columnas según el HTML

            // Estructura tabla: RUT, Nombre, Edad, Sexo, Domicilio, Ciudad
            return {
                rut: cells[0] ? cells[0].textContent.trim() : '',
                nombre: cells[1] ? cells[1].textContent.trim() : '',
                // edad: cells[2]
                sexo: cells[3] ? cells[3].textContent.trim() : '',
                direccion: cells[4] ? cells[4].textContent.trim() : '',
                comuna: cells[5] ? cells[5].textContent.trim() : ''
            };
        });

        await browser.close();

        if (!data || !data.nombre) {
            return {
                success: false,
                error: 'No se encontraron datos para este RUT',
                rut: formattedRut
            };
        }

        return {
            success: true,
            data: {
                rut: data.rut || formattedRut,
                nombre: data.nombre,
                sexo: data.sexo,
                direccion: data.direccion,
                comuna: data.comuna,
                region: '' // Esta página no devuelve región explícitamente en la tabla
            }
        };

    } catch (error) {
        if (browser) await browser.close();
        console.error('Error en scraping:', error.message);
        return {
            success: false,
            error: 'Error al consultar el RUT: ' + error.message,
            rut: formattedRut
        };
    }
}

app.get('/', (req, res) => {
    res.json({
        message: 'Bot de Scraping RUT Chile',
        version: '1.0.0',
        endpoints: {
            'GET /': 'Info del servicio',
            'GET /consulta/:rut': 'Consultar datos por RUT',
            'POST /consulta': 'Consultar datos por RUT (body: { rut: "12345678-9" })',
            'GET /validar/:rut': 'Validar formato de RUT',
            'GET /health': 'Estado del servicio'
        },
        ejemplo: '/consulta/12345678-9'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/validar/:rut', (req, res) => {
    const { rut } = req.params;
    const isValid = validateRut(rut);
    const formatted = formatRut(rut);
    res.json({
        rut: formatted,
        valido: isValid
    });
});

app.get('/consulta/:rut', async (req, res) => {
    const { rut } = req.params;

    if (!validateRut(rut)) {
        return res.status(400).json({
            success: false,
            error: 'RUT inválido. Verifica el formato (ej: 12345678-9)'
        });
    }

    console.log(`Consultando RUT: ${formatRut(rut)}`);
    const result = await scrapeRutificador(rut);

    if (result.success) {
        res.json(result);
    } else {
        res.status(404).json(result);
    }
});

app.post('/consulta', async (req, res) => {
    const { rut } = req.body;

    if (!rut) {
        return res.status(400).json({
            success: false,
            error: 'Falta el parámetro RUT'
        });
    }

    if (!validateRut(rut)) {
        return res.status(400).json({
            success: false,
            error: 'RUT inválido. Verifica el formato'
        });
    }

    console.log(`Consultando RUT: ${formatRut(rut)}`);
    const result = await scrapeRutificador(rut);

    if (result.success) {
        res.json(result);
    } else {
        res.status(404).json(result);
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Bot de Scraping ejecutándose en puerto ${PORT}`);
    console.log(`📍 Endpoints disponibles:`);
    console.log(`   GET  /consulta/:rut - Consultar datos`);
    console.log(`   POST /consulta - Consultar datos`);
    console.log(`   GET  /validar/:rut - Validar RUT`);
});
