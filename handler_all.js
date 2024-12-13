'use strict';
const fs = require('fs');
const path = require('path');
const FTPClient = require('ftp');
const xml2js = require('xml2js');
const axios = require('axios');
const { spawn } = require('child_process');

const domain = 'https://cms.soultv.com.br';
const ftpConfig = {
  host: '186.23.252.10',
  user: 'SoulTvXMLTV',
  password: 'l3j:_Jz/3bzP(kz60L'
};

const today = new Date();
const ftpFileName = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.xml`;
console.log('ftpFileName:', ftpFileName);
const localFilePath = path.join('./tmp', 'all.xml');
const scriptPath = path.join(__dirname, 'modeloxmlall.js');

module.exports.processFiles = async () => {
  let successCount = 0;
  let failureCount = 0;
  let programCount = 0;
  const startTime = Date.now();

  try {
    await downloadXMLFromFTP();

    if (!fs.existsSync(localFilePath)) {
      throw new Error(`El archivo ${localFilePath} no existe.`);
    }

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
          resolve();
        }
      });
    });

    const jsonFilePath = path.join('./tmp', `${path.basename(localFilePath, path.extname(localFilePath))}.json`);
    if (fs.existsSync(jsonFilePath)) {
      const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
      const result = await processJsonData(jsonData);
      programCount += result.programCount;
      successCount = result.successCount;
      failureCount = result.failureCount;
    } else {
      throw new Error(`Archivo JSON ${jsonFilePath} no encontrado.`);
    }
  } catch (error) {
    console.error(`Error procesando los archivos: ${error?.message || error}`);
    failureCount++;
  } finally {
    const elapsedTime = (Date.now() - startTime) / 1000;
    logResults(successCount, failureCount, programCount, elapsedTime);
  }
};

async function processJsonData(jsonData) {
  let successCount = 0;
  let failureCount = 0;
  let programCount = 0;

  const payloadList = jsonData.map((program) => {
    const { program: name, description, days } = program;
    const schedules = [];
    for (const [date, times] of Object.entries(days)) {
      times.forEach(({ startTime, stopTime }) => {
        let adjustedStopTime = stopTime;
        let endDate = date;

        const duration = getDuration(startTime, stopTime);

        if (duration < 0) {
          const startOfNextDay = new Date(new Date(date.split('/').reverse().join('-')).getTime() + 24 * 60 * 60 * 1000);
          endDate = formatDate(`${startOfNextDay.getDate()}/${startOfNextDay.getMonth() + 1}/${startOfNextDay.getFullYear()}`);
        }

        if (stopTime === "00:00:00") {
          adjustedStopTime = "23:59:00";
        }

        const daysArray = Array(7).fill(false);
        const dayOfWeek = new Date(date.split('/').reverse().join('-')).getDay();
        daysArray[dayOfWeek] = true;

        const daysObj = Object.fromEntries(daysArray.map((val, idx) => [idx, val]));

        schedules.push({
          start_date: formatDate(date),
          end_date: formatDate(endDate),
          available: true,
          time_start: formatTime(startTime),
          time_end: formatTime(adjustedStopTime),
          days: daysObj
        });
      });
    }

    if (schedules.length > 0) {
      programCount++;
      return {
        channel_id: 73, // Ajustar según sea necesario
        name,
        description: description || "Descripción no disponible",
        schedule: schedules
      };
    }
  });

  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const programDataFilePath = path.join('./tmp', `program_data_${timestamp}.json`);
    fs.writeFileSync(programDataFilePath, JSON.stringify(payloadList, null, 2), 'utf8');
    console.log(`Datos guardados en ${programDataFilePath}`);

    const response = await axios.post(domain + '                 ', payloadList);
    if (response.data.success) {
      successCount++;
    } else {
      failureCount++;
    }
  } catch (error) {
    failureCount++;
    console.error('Error enviando datos al servicio:', error.message);
  }

  return { successCount, failureCount, programCount };
}

function logResults(successCount, failureCount, programCount, elapsedTime) {
  const logMessage = `handler_all: Llamadas exitosas: ${successCount}, Llamadas fallidas: ${failureCount}, Programas enviados: ${programCount}, Tiempo transcurrido: ${elapsedTime.toFixed(2)} segundos\n`;
  const logFilePath = path.join('./tmp', 'service_call_log.txt');

  fs.appendFile(logFilePath, logMessage, (err) => {
    if (err) {
      console.error('Error al escribir en el archivo de log:', err);
    } else {
      console.log('Resultados registrados en el archivo de log.');
    }
  });
}

function getDuration(startTime, stopTime) {
  const start = new Date(`1970-01-01T${startTime}Z`);
  let stop = new Date(`1970-01-01T${stopTime}Z`);

  if (stop < start) {
    stop = new Date(stop.getTime() + 24 * 60 * 60 * 1000);
  }

  return (stop - start) / (1000 * 60);
}

function formatDate(dateStr) {
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month}-${day}`;
}

function formatTime(timeStr) {
  return timeStr.substring(0, 5);
}

async function downloadXMLFromFTP() {
  return new Promise((resolve, reject) => {
    const client = new FTPClient();

    client.on('ready', () => {
      client.get(ftpFileName, (err, stream) => {
        if (err) {
          client.end();
          return reject(`Error al descargar el archivo XML desde el FTP: ${err.message}`);
        }

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