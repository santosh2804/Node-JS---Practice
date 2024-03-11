const express = require('express')
const sqlite3 = require('sqlite3')
const path = require('path')
const {open} = require('sqlite')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const dbPath = path.join(__dirname, 'twitterClone.db')
const app = express()
app.use(express.json())

let db = null

//Starting Server
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Started')
    })
  } catch (e) {
    console.log(e.message)
  }
}

//Authentication
const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeaders = request.headers['authorization']
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'secretToken', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//Get logged in user id
const getLoggedInUserId = async (request, response, next) => {
  const username = request.username
  const getUserId = `
    SELECT user_id
    FROM user
    WHERE username = "${username}";
  `
  const userId = await db.get(getUserId)
  request.userId = userId
  next()
}

//API 1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";
    `
  const dbUser = await db.get(selectUserQuery)
  if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    const passLength = password.length
    if (passLength < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const registerUserQuery = `
                INSERT INTO user(username, password, name, gender)
                VALUES (
                    "${username}",
                    "${hashedPassword}",
                    "${name}",
                    "${gender}"
                );
            `
      await db.run(registerUserQuery)
      response.send('User created successfully')
    }
  }
})

//API 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = "${username}";
  `
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched) {
      const payload = {username: username}
      const jwtToken = await jwt.sign(payload, 'secretToken')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//API 3
app.get(
  '/user/tweets/feed/',
  authenticateToken,
  getLoggedInUserId,
  async (request, response) => {
    const userId = request.userId
    const {user_id} = userId
    const getLatestTweetsQuery = `
      SELECT
      user.username, tweet.tweet, tweet.date_time AS dateTime
      FROM
      follower
      INNER JOIN tweet
      ON follower.following_user_id = tweet.user_id
      INNER JOIN user
      ON tweet.user_id = user.user_id
      WHERE
      follower.follower_user_id = ${user_id}
      ORDER BY
      tweet.date_time DESC
      LIMIT 4;`
    const latestTweets = await db.all(getLatestTweetsQuery)
    response.send(latestTweets)
  },
)

//API 4
app.get(
  '/user/following/',
  authenticateToken,
  getLoggedInUserId,
  async (request, response) => {
    const userId = request.userId
    const {user_id} = userId
    const getUserFollowingListQuery = `
    SELECT u.name
    FROM user u JOIN follower f ON u.user_id = f.following_user_id
    WHERE f.follower_user_id = ${user_id};
  `
    const followingList = await db.all(getUserFollowingListQuery)
    response.send(followingList)
  },
)

//API 5
app.get(
  '/user/followers/',
  authenticateToken,
  getLoggedInUserId,
  async (request, response) => {
    const userId = request.userId
    const {user_id} = userId
    const getFollowersListQuery = `
    SELECT name
    FROM user JOIN follower ON user.user_id = follower.follower_user_id
    WHERE follower.following_user_id = ${user_id};
  `
    const followersList = await db.all(getFollowersListQuery)
    response.send(followersList)
  },
)

//API 6
app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  getLoggedInUserId,
  async (request, response) => {
    const {tweetId} = request.params
    const userId = request.userId
    const {user_id} = userId

    const getTweetsQuery = `
      SELECT *
      FROM tweet
      WHERE tweet_id = ${tweetId};
    `
    const tweetResult = await db.get(getTweetsQuery)

    const getUserFollowersQuery = `
      SELECT *
      FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
      WHERE follower.follower_user_id = ${user_id};
    `
    const userFollowers = await db.all(getUserFollowersQuery)

    if (
      userFollowers.some(item => item.following_user_id === tweetResult.user_id)
    ) {
      const getTweetQuery = `
      SELECT 
          Tweet.tweet AS tweet,
          COUNT(DISTINCT Like.like_id) AS likes,
          COUNT(DISTINCT Reply.reply_id) AS replies,
          Tweet.date_time AS dateTime
      FROM 
          Tweet
      LEFT JOIN 
          Like ON Tweet.tweet_id = Like.tweet_id
      LEFT JOIN 
          Reply ON Tweet.tweet_id = Reply.tweet_id
      JOIN 
          Follower ON Tweet.user_id = Follower.following_user_id
      WHERE 
          Follower.follower_user_id = ${user_id}
      GROUP BY 
          Tweet.tweet_id;
    `
      const tweetResult = await db.get(getTweetQuery)
      response.send(tweetResult)
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  getLoggedInUserId,
  async (request, response) => {
    const {tweetId} = request.params
    const userId = request.userId
    const {user_id} = userId

    const getTweetsQuery = `
      SELECT *
      FROM tweet
      WHERE tweet_id = ${tweetId};
    `
    const tweetResult = await db.get(getTweetsQuery)
    console.log(tweetResult)

    const getUserFollowersQuery = `
      SELECT *
      FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
      WHERE follower.follower_user_id = ${user_id};
    `
    const userFollowers = await db.all(getUserFollowersQuery)
    if (
      userFollowers.some(item => item.following_user_id === tweetResult.user_id)
    ) {
      const getLikedUsersQuery = `
        SELECT name
        FROM user NATURAL JOIN like
        WHERE like.tweet_id = ${tweetId};
      `
      const likedUsersLit = await db.all(getLikedUsersQuery)
      const dbResponse = likedUsersLit.map(eachUser => eachUser.name)
      response.send({likes: dbResponse})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  getLoggedInUserId,
  async (request, response) => {
    const {tweetId} = request.params
    const userId = request.userId
    const {user_id} = userId

    const getTweetsQuery = `
      SELECT *
      FROM tweet
      WHERE tweet_id = ${tweetId};
    `
    const tweetResult = await db.get(getTweetsQuery)

    const getUserFollowersQuery = `
      SELECT *
      FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
      WHERE follower.follower_user_id = ${user_id};
    `
    const userFollowers = await db.all(getUserFollowersQuery)
    console.log(tweetResult)

    if (
      userFollowers.some(item => item.following_user_id === tweetResult.user_id)
    ) {
      const getTweetRepliesQuery = `
      SELECT name, reply
      FROM user NATURAL JOIN reply
      WHERE tweet_id = ${tweetId};
    `
      const tweetReplies = await db.all(getTweetRepliesQuery)
      response.send({replies: tweetReplies})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 9
app.get(
  '/user/tweets/',
  authenticateToken,
  getLoggedInUserId,
  async (request, response) => {
    const userId = request.userId
    const {user_id} = userId
    console.log(user_id)
    const getUserTweetsQuery = `
      SELECT 
          Tweet.tweet AS tweet,
          COUNT(DISTINCT Like.like_id) AS likes,
          COUNT(DISTINCT Reply.reply_id) AS replies,
          Tweet.date_time AS dateTime
      FROM 
          Tweet
      LEFT JOIN 
          Like ON Tweet.tweet_id = Like.tweet_id
      LEFT JOIN 
          Reply ON Tweet.tweet_id = Reply.tweet_id
      JOIN 
          Follower ON Tweet.user_id = Follower.following_user_id
      WHERE 
          Follower.follower_user_id = ${user_id}
      GROUP BY 
          Tweet.tweet_id;
    `
    const userTweetsList = await db.all(getUserTweetsQuery)
    console.log(userTweetsList)
    response.send(userTweetsList)
  },
)

//API 10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const createTweetQuery = `
    INSERT INTO tweet(tweet)
    VALUES("${tweet}");
  `
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

//API 11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  getLoggedInUserId,
  async (request, response) => {
    const {tweetId} = request.params

    const getTweedAdminQuery = `
      SELECT name
      FROM user NATURAL JOIN tweet
      WHERE tweet_id = ${tweetId};
    `
    const tweetAdmin = await db.get(getTweedAdminQuery)
    if (tweetAdmin !== undefined) {
      const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE tweet_id = ${tweetId};
      `
      await db.run(deleteTweetQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

initializeDBAndServer()

module.exports = app
