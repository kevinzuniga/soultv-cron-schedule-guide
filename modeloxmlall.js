const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const parser = new xml2js.Parser();

// Mapeo de XMLID a SoulTVID
const channelMapping = {
  '5029': '245',
  '5500': '99',
  '5770': '269',
  '5788': '218',
  '6130': '126',
  '6313': '182',
  '7140': '112',
  '7893': '92',
  '8345': '98',
  '8372': '240',
  '8542': '261',
  '8912': '74',
  '8917': '163',
  '8922': '127'
};

const filePath = process.argv[2];
console.log('filePath', filePath);
const outputFilePath = path.join('./tmp', path.basename(filePath, path.extname(filePath)) + '.json');

// Función para formatear el tiempo del XML
function formatXmlTime(xmlTime) {
  const year = xmlTime.substring(0, 4);      // Año
  const month = xmlTime.substring(4, 6);     // Mes
  const day = xmlTime.substring(6, 8);       // Día
  const hour = xmlTime.substring(8, 10);     // Hora
  const minute = xmlTime.substring(10, 12);  // Minutos
  const second = xmlTime.substring(12, 14);  // Segundos

  // Retornar en el formato 'YYYY-MM-DD HH:MM:SS'
  return {
    date: `${day}/${month}/${year}`,             // Fecha en formato 'DD/MM/YYYY'
    time: `${hour}:${minute}:${second}`          // Hora en formato 'HH:MM:SS'
  };
}

// Leer el archivo XML
fs.readFile(filePath, (err, data) => {
  if (err) throw err;

  parser.parseString(data, (err, result) => {
    if (err) throw err;

    const programmes = result.tv.programme.flatMap(program => {
      const { date: programDate, time: startTime } = formatXmlTime(program.$.start); // Formatear fecha y hora de inicio
      const { time: stopTime } = formatXmlTime(program.$.stop);                      // Formatear hora de fin
      const xmlChannelId = program.$.channel;                                        // ID del canal en XML

      // Verificar si el canal está en el mapeo
      const channelId = channelMapping[xmlChannelId];
      if (!channelId) {
        console.log(`Channel ID ${xmlChannelId} no está en el mapeo.`);
        return []; // Omitir este programa si el canal no está en el mapeo
      }

      const title = program.title[0]._ || '';                                        // Título del programa
      const description = program.desc ? program.desc[0]._ : '';                     // Descripción del programa
      const genre = program.category ? program.category[0]._ : '';                   // Género del programa
      const classification = program.rating ? program.rating[0].value[0] : '';       // Clasificación del programa

      return [{
        channel_id: channelId,  // Guardar SoulTVID como channel_id
        title,
        programDate,
        startTime,
        stopTime,
        genre,
        classification,
        description
      }];
    });

    // Agrupar los programas por título y día
    const programsByTitleAndDate = programmes.reduce((acc, program) => {
      let programEntry = acc.find(p => p.channel_id === program.channel_id && p.program === program.title);
      if (!programEntry) {
        programEntry = {
          channel_id: program.channel_id,
          program: program.title,
          days: {}
        };
        acc.push(programEntry);
      }
      
      // Añadir el programa al día correspondiente
      if (!programEntry.days[program.programDate]) {
        programEntry.days[program.programDate] = [];
      }
      programEntry.days[program.programDate].push({
        startTime: program.startTime,
        stopTime: program.stopTime,
        genre: program.genre,
        classification: program.classification,
        description: program.description
      });

      return acc;
    }, []);

    // Escribir el JSON de salida
    console.log('outputFilePath', outputFilePath);
    fs.writeFile(outputFilePath, JSON.stringify(programsByTitleAndDate, null, 2), (err) => {
      if (err) throw err;
      console.log('Archivo JSON generado correctamente.');
    });
  });
});