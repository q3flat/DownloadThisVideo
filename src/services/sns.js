'use strict';

module.exports = {
    sendToSns,
    getPayloadFromSnsEvent
};

const AWS = require('aws-sdk');
const sns = new AWS.SNS();

function sendToSns (data) {
    console.log('Publishing ' + data.length + ' tweets (s) to SNS.');
    console.log('To TopicArn:' + process.env.TOPIC_ARN);
    const params = {
        Message: JSON.stringify(data),
        TopicArn: process.env.TOPIC_ARN
    };
    return sns.publish(params).promise();
}

function getPayloadFromSnsEvent(event) {
    return event.Records.reduce((acc, record) => acc.concat(JSON.parse(record.Sns.Message)), []);
}
