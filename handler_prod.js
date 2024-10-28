'use strict';
const axios = require('axios');
const fs = require('fs');
// const { exec } = require('child_process');
const { spawn } = require('child_process');
const path = require('path');
const https = require('https');
const http = require('http');

// const domain = 'https://dev-cms.soultv.com.br';
const domain = 'https://cms.soultv.com.br';
// const domain = 'https://relevant-previously-cowbird.ngrok-free.app';

module.exports.processFiles = async () => {
  let successCount = 0;
  let failureCount = 0;

  try {
    // Hacer la solicitud al API
    const response = await axios.get(domain+'/v1/brand/files/');
    if (response.data.success) {
      const files = response.data.data;

      for (const file of files) {
        const { id: channel_id, file_url, file_format_type } = file;
        
        // Descargar el archivo
        const filePath = path.join('./tmp', path.basename(file_url));
        const fileWriter = fs.createWriteStream(filePath);

        await new Promise((resolve, reject) => {
          const protocol = file_url.startsWith('https') ? https : http;
          protocol.get(file_url, function(response) {
            response.pipe(fileWriter);
            fileWriter.on('finish', function() {
              fileWriter.close(resolve);
            });
          }).on('error', function(err) {
            fs.unlink(filePath);
            reject(err.message);
          });
        });

        // Ejecutar el script correspondiente
        const scriptPath = path.join(__dirname, `${file_format_type}.js`);
        if (fs.existsSync(scriptPath)) {
          await new Promise((resolve, reject) => {
            const child = spawn('node', [`${scriptPath}`, `${filePath}`]);
          
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
                const jsonFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');
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
    const { program: name, days } = program;
    const schedules = [];
    for (const [date, times] of Object.entries(days)) {
      console.log(`***Programa***: ${name} date: ${date}`, times);
    }

    for (const [date, times] of Object.entries(days)) {
      const dayOfWeek = new Date(date.split('/').reverse().join('-')).getDay();

      times.forEach(({ startTime, stopTime }) => {
        console.log(`Procesando programa: ${name}`, times); // Verificación de datos de entrada

        let adjustedStopTime = stopTime;
        let endDate = date;

        let duration = getDuration(startTime, stopTime);
        console.log(`Duración calculada para ${name} en ${date}: ${duration} minutos`); // Verificación de duración

        // Caso 1: Si el programa cruza la medianoche
        if (duration < 0) {
          const startOfNextDay = new Date(new Date(date.split('/').reverse().join('-')).getTime() + 24 * 60 * 60 * 1000);
          endDate = formatDate(`${startOfNextDay.getDate()}/${startOfNextDay.getMonth() + 1}/${startOfNextDay.getFullYear()}`);

          adjustedStopTime = stopTime;  // Mantener el stopTime como fue ingresado
          duration = getDuration(startTime, stopTime); // Recalcular duración correctamente
        }

        // Caso 2: Si el programa termina exactamente a la medianoche
        if (stopTime === "00:00:00") {
          adjustedStopTime = "23:59:00";  // Ajustar stopTime al final del día
          duration = getDuration(startTime, adjustedStopTime);
        }

        // Solo agregar al payload si la duración es mayor a 29 minutos
        if (duration > 29) {
          const daysArray = Array(7).fill(false);
          daysArray[dayOfWeek] = true;

          if (duration < 0) {  // Marcar el día siguiente también si cruza medianoche
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
        } else {
          console.log(`El programa ${name} en ${date} fue omitido debido a la duración: ${duration} minutos`); // Verificación de omisión
        }
      });
    }

    if (schedules.length > 0) {
      payloadList.push({
        channel_id,
        name,
        description: "",
        schedule: schedules
      });
    }
  }

  if (payloadList.length > 0) {
    // console.log('Payload preparado:', JSON.stringify(payloadList, null, 2)); // Verificación del payload

    const startTime = Date.now();
    try {
      await postProgramData(payloadList);
      successCount++;
    } catch (error) {
      failureCount++;
      console.error('Error enviando datos:', error);
    } finally {
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // Duración en segundos
      logServiceCall(duration, payloadList.length);
    }
  }

  return { successCount, failureCount };
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

async function postProgramData(data) {
  try {
    // Guardar la data en un archivo JSON antes de enviarla
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const jsonFilePath = path.join(__dirname, `program_data_${timestamp}.json`);
    fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Datos guardados en ${jsonFilePath}`);

    // Enviar los datos al servicio
    const response = await axios.post(domain + '/v1/program/all/', data);
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