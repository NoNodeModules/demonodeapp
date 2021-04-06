const AWS = require('aws-sdk');

module.exports = async function(filename) {
    var _return  = {};
    const params = {
        TranscriptionJobName: filename
    }

    AWS.config.update({
        region: "us-east-2",
        accessKeyId: process.env.AWS_ID,
        secretAccessKey: process.env.AWS_SECRET
    });

    var transcribeService = new AWS.TranscribeService();

    _return.myData = function(callback){
        transcribeService.getTranscriptionJob(params, function (err, data) {
            try {
                var json = JSON.stringify(data);
            } catch (err) {
                console.log(err);
            }
            callback(data);
        });
    }
    return _return ;
}