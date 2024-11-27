'use strict';
const axios = require('axios');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const https = require('https');
const http = require('http');

const domain = 'https://cms.soultv.com.br';

module.exports.processFiles = async () => {
  let successCount = 0;
  let failureCount = 0;

  try {
    // Hacer la solicitud al API
    const response = await axios.get(domain + '/v1/brand/files/');
    if (response.data.success) {
      const files = response.data.data;

      for (const file of files) {
        const { id: channel_id, file_url, file_format_type } = file;

        // Descargar el archivo al directorio /tmp
        const fileName = path.basename(file_url);
        const filePath = path.join('/tmp', fileName);
        const fileWriter = fs.createWriteStream(filePath);

        await new Promise((resolve, reject) => {
          const protocol = file_url.startsWith('https') ? https : http;
          protocol.get(file_url, function(response) {
            response.pipe(fileWriter);
            fileWriter.on('finish', function() {
              fileWriter.close(resolve);
            });
          }).on('error', function(err) {
            fs.unlink(filePath, () => {}); // Borrar el archivo en caso de error
            reject(err.message);
          });
        });

        // Ejecutar el script correspondiente
        const scriptPath = path.join(__dirname, `${file_format_type}.js`);
        if (fs.existsSync(scriptPath)) {
          await new Promise((resolve, reject) => {
            const child = spawn('node', [scriptPath, filePath]);

            child.stdout.on('data', (data) => {
              console.log(`stdout: ${data}`);
            });

            child.stderr.on('data', (data) => {
              console.error(`stderr: ${data}`);
            });

            child.on('close', (code) => {
              if (code !== 0) {
                reject(new Error(`Proceso finalizó con código ${code}`));
              } else {
                const jsonFilePath = path.join('/tmp', `${path.basename(filePath, path.extname(filePath))}.json`);
                const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
                processJsonData(jsonData, channel_id, successCount, failureCount)
                  .then((counts) => {
                    successCount = counts.successCount;
                    failureCount = counts.failureCount;
                    resolve();
                  })
                  .catch((err) => {
                    failureCount++;
                    console.error(`Error procesando JSON para el canal ${channel_id}:`, err);
                    reject();
                  });
              }
            });
          });
        } else {
          console.error(`Script ${file_format_type}.js no encontrado`);
          failureCount++;
        }
      }
    } else {
      console.error('Error en la respuesta del API');
      failureCount++;
    }
  } catch (error) {
    console.error(`Error procesando los archivos: ${error?.message || error}`);
    failureCount++;
  } finally {
    logResults(successCount, failureCount);
  }
};

async function processJsonData(jsonData, channel_id, successCount, failureCount) {
  const payloadList = [];

  for (const program of jsonData) {
    const { program: name, description, days } = program;
    const schedules = [];
    for (const [date, times] of Object.entries(days)) {
      times.forEach(({ startTime, stopTime }) => {
        let adjustedStopTime = stopTime;
        let endDate = date;

        let duration = getDuration(startTime, stopTime);

        // Caso 1: Si el programa cruza la medianoche
        if (duration < 0) {
          const startOfNextDay = new Date(new Date(date.split('/').reverse().join('-')).getTime() + 24 * 60 * 60 * 1000);
          endDate = formatDate(`${startOfNextDay.getDate()}/${startOfNextDay.getMonth() + 1}/${startOfNextDay.getFullYear()}`);
        }

        // Caso 2: Si el programa termina exactamente a la medianoche
        if (stopTime === "00:00:00") {
          adjustedStopTime = "23:59:00";
          duration = getDuration(startTime, adjustedStopTime);
        }

        if (duration > 29) {
          const daysArray = Array(7).fill(false);
          const dayOfWeek = new Date(date.split('/').reverse().join('-')).getDay();
          daysArray[dayOfWeek] = true;

          const daysObj = Object.fromEntries(daysArray.map((val, idx) => [idx, val]));

          const schedule = {
            start_date: formatDate(date),
            end_date: formatDate(endDate),
            available: true,
            time_start: formatTime(startTime),
            time_end: formatTime(adjustedStopTime),
            days: daysObj
          };

          schedules.push(schedule);
        }
      });
    }

    if (schedules.length > 0) {
      payloadList.push({
        channel_id,
        name,
        description: description || "Descripción no disponible",
        schedule: schedules
      });
    }
  }

  if (payloadList.length > 0) {
    try {
      await postProgramData(payloadList);
      successCount++;
    } catch (error) {
      failureCount++;
      console.error('Error enviando datos:', error);
    }
  }

  return { successCount, failureCount };
}

async function postProgramData(data) {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const jsonFilePath = path.join('/tmp', `program_data_${timestamp}.json`);
  fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Datos guardados en ${jsonFilePath}`);

  const response = await axios.post(domain + '/v1/program/all/', data);
  if (!response.data.success) {
    throw new Error(`Error en la respuesta del servidor: ${JSON.stringify(response.data)}`);
  }
}

function logResults(successCount, failureCount) {
  const logMessage = `Llamadas exitosas: ${successCount}, Llamadas fallidas: ${failureCount}\n`;
  const logFilePath = path.join('/tmp', 'service_call_log.txt');

  fs.appendFile(logFilePath, logMessage, (err) => {
    if (err) {
      console.error('Error al escribir en el archivo de log:', err);
    } else {
      console.log('Resultados registrados en el archivo de log.');
    }
  });
}

function formatDate(dateStr) {
  const [day, month, year] = dateStr.split('/');
  return `${day}-${month}-${year}`;
}

function formatTime(timeStr) {
  return timeStr.substring(0, 5);
}

function getDuration(startTime, stopTime) {
  const start = new Date(`1970-01-01T${startTime}Z`);
  let stop = new Date(`1970-01-01T${stopTime}Z`);

  if (stop < start) {
    stop = new Date(stop.getTime() + 24 * 60 * 60 * 1000);
  }

  return (stop - start) / (1000 * 60);
}