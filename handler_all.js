'use strict';
const axios = require('axios');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const FTPClient = require('ftp');

// Datos de conexión FTP
const ftpConfig = {
  host: '186.23.252.10',
  user: 'SoulTvXMLTV',
  password: 'l3j:_Jz/3bzP(kz60L'
};

// Generar el nombre del archivo XML con la fecha de hoy
const today = new Date();
const ftpFileName = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.xml`;
const localFilePath = path.join('/tmp', 'all.xml');  // Guardar localmente como 'all.xml'
const scriptPath = path.join(__dirname, 'modeloxmlall.js');
const domain = 'https://upload.soultv.com.br';

module.exports.processFiles = async () => {
  let successCount = 0;
  let failureCount = 0;

  try {
    // Descargar el archivo XML desde el FTP
    await downloadXMLFromFTP();

    // Comprobar si el archivo XML fue descargado correctamente
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`El archivo ${localFilePath} no existe.`);
    }

    // Ejecutar el script modeloxmlall.js para procesar all.xml
    await new Promise((resolve, reject) => {
      const child = spawn('node', [scriptPath, localFilePath]);

      child.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
      });

      child.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`El proceso finalizó con el código ${code}`));
        } else {
          const jsonFilePath = path.join('/tmp', `${path.basename(localFilePath, path.extname(localFilePath))}.json`);
          if (fs.existsSync(jsonFilePath)) {
            const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
            processJsonData(jsonData, successCount, failureCount)
              .then((counts) => {
                successCount = counts.successCount;
                failureCount = counts.failureCount;
                resolve();
              })
              .catch((err) => {
                failureCount++;
                console.error(`Error procesando JSON:`, err);
                reject();
              });
          } else {
            console.error('Archivo JSON no encontrado después de la ejecución del script.');
            failureCount++;
            reject();
          }
        }
      });
    });
  } catch (error) {
    console.error(`Error procesando los archivos: ${error?.message || error}`);
    failureCount++;
  } finally {
    logResults(successCount, failureCount);
  }
};

// Función para descargar el archivo XML desde el FTP
async function downloadXMLFromFTP() {
  return new Promise((resolve, reject) => {
    const client = new FTPClient();

    client.on('ready', () => {
      client.get(ftpFileName, (err, stream) => {
        if (err) {
          client.end();
          return reject(`Error al descargar el archivo XML desde el FTP: ${err.message}`);
        }

        // Guardar el archivo XML localmente en /tmp
        stream.pipe(fs.createWriteStream(localFilePath));
        stream.on('close', () => {
          console.log(`Archivo XML descargado correctamente en ${localFilePath}`);
          client.end();
          resolve();
        });
      });
    });

    client.on('error', (err) => {
      reject(`Error de conexión FTP: ${err.message}`);
    });

    client.connect(ftpConfig);
  });
}