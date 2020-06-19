"use strict";

const {
    not,
    and,
    pluck,
    randomSuccessResponse,
} = require('../utils');
const {
    isTweetAReplyToMe,
    isTweetAReply
} = require('./tweet_operations');
const {wrapTwitterErrors, errors} = require('twitter-error-handler');
const aargh = require('aargh');
const Twit = require('twit');

const t = new Twit({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    timeout_ms: 7*1000
});

module.exports = (cache) => {

    const getMentions = async (lastTweetRetrieved) => {
        let lastTweetId = lastTweetRetrieved || await cache.getAsync('lastTweetRetrieved');
        let options = {count: 200};
        if (lastTweetId) {
            options.since_id = lastTweetId;
        }
        const endpoint = 'statuses/mentions_timeline';
        return t.get(endpoint, options)
            .catch(e => wrapTwitterErrors(endpoint, e))
            .then(r => r.data)
            .then(tweets => tweets.filter(and(isTweetAReply, not(isTweetAReplyToMe))))
            .then(tweets => tweets.map(tweetObject => {
                return {
                    id: tweetObject.id_str,
                    time: tweetObject.created_at,
                    referencing_tweet: tweetObject.in_reply_to_status_id_str,
                    author: tweetObject.user.screen_name
                }
            }))
            .catch(e => {
                return aargh(e)
                    .type(errors.BadRequest)
                    .throw();
            });
    };

    const getActualTweetsReferenced = (tweets) => {
        return t.post(`statuses/lookup`, {
            id: pluck(tweets, 'referencing_tweet'),
            tweet_mode: 'extended',
        })
            .then(r => r.data)
            .catch(e => wrapTwitterErrors('statuses/lookup', e));
    };

    const reply = async (tweet, content) => {
        let options = {
            in_reply_to_status_id: tweet.id,
            status: `@${tweet.author} ${content}`
        };
        return t.post('statuses/update', options)
            .catch(e => wrapTwitterErrors('statuses/update', e))
            .catch(e => {
                return aargh(e)
                    .type(errors.RateLimited, async (e) => {
                        // not sending any more replies for 10 minutes
                        // to avoid Twitter blocking our API access
                        console.log('Rate limit reached, backing off for 10 minutes');
                        await cache.setAsync('no-reply', 1, 'EX', 10 * 60);
                    })
                    .type(errors.BadRequest, console.log)
                    .throw();
            })
    };

    const replyWithRedirect = async (tweet, link) => {
        let noReply = await cache.getAsync('no-reply');
        if (noReply == 1) {
            return true;
        }

        let content = randomSuccessResponse(tweet.author, link);
        return reply(tweet, content);
    };

    const fetchTweet = (tweetId) => {
        return t.get(`statuses/show`, {
            id: tweetId,
            tweet_mode: 'extended',
        }).then(r => r.data)
            .catch(e => wrapTwitterErrors('statuses/show', e));
    };

    return {
        getMentions,
        reply,
        replyWithRedirect,
        getActualTweetsReferenced,
        fetchTweet,
    };

};
