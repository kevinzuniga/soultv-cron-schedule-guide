'use strict';
const axios = require('axios');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

// Ruta del archivo XML local y del script de procesamiento
const localFilePath = path.join(__dirname, 'all.xml');
const scriptPath = path.join(__dirname, 'modeloxmlall.js');
const domain = 'https://cms.soultv.com.br';

module.exports.processFiles = async () => {
  let successCount = 0;
  let failureCount = 0;

  try {
    // Comprobar si el archivo XML existe
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
          // Leer el archivo JSON generado
          const jsonFilePath = path.join('./tmp', path.basename(localFilePath, path.extname(localFilePath)) + '.json');
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

// Función para procesar los datos JSON generados y llamar a la API para guardar en la BD
async function processJsonData(jsonData, successCount, failureCount) {
  const payloadList = [];

  for (const program of jsonData) {
    const { channel_id, program: name, description, days } = program;
    const schedules = [];

    for (const [date, timesArray] of Object.entries(days)) {
      const dayOfWeek = new Date(date.split('/').reverse().join('-')).getDay();

      timesArray.forEach(({ startTime, stopTime }) => {
        let adjustedStopTime = stopTime;
        let endDate = date;

        let duration = getDuration(startTime, stopTime);

        if (duration < 0) {
          const startOfNextDay = new Date(new Date(date.split('/').reverse().join('-')).getTime() + 24 * 60 * 60 * 1000);
          endDate = formatDate(`${startOfNextDay.getDate()}/${startOfNextDay.getMonth() + 1}/${startOfNextDay.getFullYear()}`);
          adjustedStopTime = stopTime;
          duration = getDuration(startTime, stopTime);
        }

        if (stopTime === "00:00:00") {
          adjustedStopTime = "23:59:00";
          duration = getDuration(startTime, adjustedStopTime);
        }

        if (duration > 29) {
          const daysArray = Array(7).fill(false);
          daysArray[dayOfWeek] = true;

          if (duration < 0) {
            const nextDayOfWeek = (dayOfWeek + 1) % 7;
            daysArray[nextDayOfWeek] = true;
          }

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
        description,
        schedule: schedules
      });
    }
  }

  if (payloadList.length > 0) {
    // Guardar el payloadList en un archivo JSON antes de enviarlo al servicio
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const jsonFilePath = path.join(__dirname, `program_data_${timestamp}.json`);
    fs.writeFileSync(jsonFilePath, JSON.stringify(payloadList, null, 2), 'utf8');
    console.log(`Datos guardados en ${jsonFilePath}`);

    const startTime = Date.now();
    try {
      await postProgramData(payloadList); // Llamar a la API para almacenar en la BD
      successCount++;
    } catch (error) {
      failureCount++;
      console.error('Error enviando datos:', error);
    } finally {
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      logServiceCall(duration, payloadList.length);
    }
  }

  return { successCount, failureCount };
}

// Función para enviar datos a la API
async function postProgramData(data) {
  try {
    const response = await axios.post(`${domain}/v1/program/all/`, data);
    if (response.data.success) {
      console.log('Datos enviados exitosamente:', response.data);
    } else {
      throw new Error(`Error en la respuesta del servidor: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('Error enviando datos:', error.response ? error.response.data : error.message);
    throw error;
  }
}

function getDuration(startTime, stopTime) {
  const start = new Date(`1970-01-01T${startTime}Z`);
  let stop = new Date(`1970-01-01T${stopTime}Z`);

  // Si stopTime es menor que startTime, asume que cruza la medianoche
  if (stop < start) {
    stop = new Date(stop.getTime() + 24 * 60 * 60 * 1000); // Añadir 24 horas al tiempo de finalización
  }

  return (stop - start) / (1000 * 60); // Duración en minutos
}

function formatDate(dateStr) {
  const [day, month, year] = dateStr.split('/');
  return `${day}-${month}-${year}`;
}

function formatTime(timeStr) {
  return timeStr.substring(0, 5);
}

// Función auxiliar para registrar los resultados
function logResults(successCount, failureCount) {
  const logMessage = `Llamadas exitosas: ${successCount}, Llamadas fallidas: ${failureCount}\n`;
  const logFilePath = path.join(__dirname, 'service_call_log.txt');

  fs.appendFile(logFilePath, logMessage, (err) => {
    if (err) {
      console.error('Error al escribir en el archivo de log:', err);
    } else {
      console.log('Resultados registrados en el archivo de log.');
    }
  });
}

function logServiceCall(duration, programCount) {
  const logMessage = `Duración de la llamada: ${duration} segundos, Programas enviados: ${programCount}\n`;
  const logFilePath = path.join(__dirname, 'service_call_log.txt');

  fs.appendFile(logFilePath, logMessage, (err) => {
    if (err) {
      console.error('Error al escribir en el archivo de log:', err);
    } else {
      console.log('Duración de la llamada registrada en el archivo de log.');
    }
  });
}