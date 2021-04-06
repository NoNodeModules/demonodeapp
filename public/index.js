require('dotenv').config();
const express = require('express');
const upload = require('express-fileupload');
const multer = require('multer');
const AWS = require('aws-sdk');
const uuid = require('uuid');
const new_uuid = uuid.v4();
const port = '8000';
const bodyParser = require('body-parser');
const fetch = require("node-fetch");
const fs = require('fs');
const path = require('path');


AWS.config.update({
    region: "us-east-2",
    accessKeyId: process.env.AWS_ID,
    secretAccessKey: process.env.AWS_SECRET
});


const sample_file = async function (filename) {
    var _return = {};
    const params = {
        TranscriptionJobName: filename
    }

    AWS.config.update({
        region: "us-east-2",
        accessKeyId: process.env.AWS_ID,
        secretAccessKey: process.env.AWS_SECRET
    });

    var transcribeService = new AWS.TranscribeService();

    _return.myData = function (callback) {
        transcribeService.getTranscriptionJob(params, function (err, data) {
            try {
                var json = JSON.stringify(data);
            } catch (err) {
                console.log(err);
            }
            callback(data);
        });
    }
    return _return;
}

const app = express();
let success = false;
app.use(upload());




app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});
app.use(express.static(__dirname + '/static'));

//initiating s3 storage
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ID,
    secretAccessKey: process.env.AWS_SECRET
})


app.get('/download', (req, res) => {
    res.download(__dirname + "/data_folder/transcription_data.txt", "transcription_data.txt");
});

app.post('/', (req, res) => {
    if (req.files) {
        var file = req.files.audio_file;
        console.log(file.name);
        console.log(file.data);
        const IntervalTime = (file.data.length) / 600;
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `${new_uuid}.mp3`,
            Body: file.data,
            ACL: 'public-read'
        };

        s3.upload(params, async (error, data) => {
            try {
                console.log(`File uploaded successfully. ${data.Location}`);
                let MediaFileUri = data.Location;
                console.log("media file uri");
                console.log(MediaFileUri);

                let transcribe_Filename = await create_Transcribe(MediaFileUri);
                console.log("filename in s3", transcribe_Filename)


                var interval = setInterval(async () => {
                    let all_Data_check = await sample_file(transcribe_Filename)
                    all_Data_check.myData(async (my_transcribe_data) => {
                        let get_status = my_transcribe_data['TranscriptionJob']['TranscriptionJobStatus']
                        console.log(get_status);
                        let data_value = ''
                        if (get_status === 'COMPLETED') {

                            let my_data_link = my_transcribe_data['TranscriptionJob']['Transcript']['TranscriptFileUri'];
                            const response = await fetch(my_data_link);
                            json = await response.json();

                            let transcript_data = (json['results']['transcripts']);
                            let get_transcript_data = ""
                            for (var i = 0; i < transcript_data.length; i++) {
                                get_transcript_data = get_transcript_data + transcript_data[i]['transcript'];
                            }

                            let modified_transcript_data = get_transcript_data.split('.').join('\n');
                            console.log(modified_transcript_data);
                            get_transcript_data = modified_transcript_data;
                            let file_path = __dirname + "/data_folder/" + "transcription_data.txt"

                            fs.writeFile(file_path, get_transcript_data, (err) => {
                                console.log("file created")
                                if (err) throw err;
                            })

                            console.log("transcript data", get_transcript_data);
                            var comprehend = new AWS.Comprehend();
                            comprehend.detectEntities({
                                "LanguageCode": "en",
                                "Text": get_transcript_data
                            }, function (err, data) {
                                if (err) console.log(err, err.stack); // an error occurred
                                else {
                                    console.log(data);
                                    comprehend.detectSentiment({
                                        "LanguageCode": "en",
                                        "Text": get_transcript_data
                                    }, function (err, sendata) {
                                        if (err) console.log(err, err.stack); // an error occurred
                                        else {
                                            console.log(sendata);
                                            apirequest(get_transcript_data, data, sendata);
                                        }
                                    })
                                }          // successful response
                            });

                            success = true;

                            clearInterval(interval);

                        } else {

                            data_value = '1'

                        }
                    });
                }, IntervalTime);


            } catch (error) {
                res.status(500).send({
                    message: "Sorry, i didn't find that"
                });
            }
        });



    } else {
        console.log('no file find');
    }
});

// /*  working properly final create transcribe */
const create_Transcribe = async (MediaFileUri) => {
    /* upload the file on AWS Transcribe and convert it into text */
    let transcribeFile_name = `${new_uuid}`;
    const params = {
        TranscriptionJobName: transcribeFile_name,
        Media: { MediaFileUri },
        MediaFormat: 'mp3',
        LanguageCode: 'en-US'
    }


    AWS.config.update({
        region: "us-east-2",
        accessKeyId: process.env.AWS_ID,
        secretAccessKey: process.env.AWS_SECRET
    });

    var transcribeService = new AWS.TranscribeService();
    transcribeService.startTranscriptionJob(params, function (err, data) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('transcribe file data');
            console.log(data);


        }
    });
    return transcribeFile_name
};

app.listen(port, () => {
    console.log(`server is running at: localhost:${port}`);
});


function apirequest(get_transcript_data, data, sendata) {

    app.get('/api', (req, res) => {

        res.send({
            'message': get_transcript_data,
            'entities': data,
            'sentiment': sendata
        })
    })

    app.get('/loaded', (req, res) => {
        res.send({
            'message': 'file transcribed'
        })

    })
}