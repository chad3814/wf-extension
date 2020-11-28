// @flow strict

const fs = require('fs').promises;
const path = require('path');

const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const BigInt = require('graphql-bigint');

const data = require('./data');

const sleep = async function (seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
};

// Construct a schema, using GraphQL schema language
const schema = buildSchema(`
  scalar BigInt
  input RawHistory {
    history_id: Int!
    ts: BigInt!
    seat_id: Int
    player: String
    action: String
    rest: String
    opponent: String
    opponent_seat_id: Int
  }
  type Query {
    hasHistory(game_id: Int!, user_id: String!): Boolean!
    listGameIds: [Int!]
    listHistoriesForGameId(game_id: Int!): [String!]
    isGameComplete(game_id: Int!): Boolean!
  }
  type Mutation {
    sendHistory(game_id: Int!, user_id: String!, raw_history: [RawHistory!]): Boolean!
    fetchData(game_id: Int!): Boolean!
  }
`);
 
// The root provides a resolver function for each API endpoint
const root = {
  BigInt,
  hasHistory: async ({game_id, user_id}) => {
    try {
      return !await fs.access(`storage/${game_id}/${user_id}.json`);
    } catch (err) {
      return false;
    }
  },
  listGameIds: async () => {
    const game_ids = [];
    const entries = await fs.readdir('storage');
    for (const entry of entries) {
      const stat = await fs.stat(`storage/${entry}`);
      if (stat.isDirectory()) {
          game_ids.push(parseInt(entry, 10));
      }
    }
    return game_ids;
  },
  listHistoriesForGameId: async ({game_id}) => {
    const user_ids = [];
    const entries = await fs.readdir(`storage/${game_id}`);
    for (const entry of entries) {
      const ext = path.extname(entry);
      const name = path.basename(entry, ext);
      if (ext === '.json' && name !== 'data') {
          user_ids.push(name);
      }
    }
    return user_ids;
  },
  isGameComplete: async ({game_id}) => {
    let game_data;
    try {
      game_data = require(`./storage/${game_id}/data.json`); 
    } catch (err) {
      return false;
    }
    const promises = game_data.players.map(({profile_id}) => fs.access(`storage/${game_id}/${profile_id}.json`));
    try {
      await Promise.all(promises);
    } catch (err) {
      return false;
    }
    return true;
  },
  sendHistory: async ({game_id, user_id, raw_history}) => {
    try {
      await fs.mkdir(`storage/${game_id}`);
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }

    return !await fs.writeFile(`storage/${game_id}/${user_id}.json`, JSON.stringify(raw_history));
  },
  fetchData: async ({game_id}) => {
    const game_data = await data.getData(game_id);
    try {
      await fs.mkdir(`storage/${game_id}`);
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }

    return !await fs.writeFile(`storage/${game_id}/data.json`, JSON.stringify(game_data));
  },
};
 
const app = express();
app.use('/graph', graphqlHTTP({
  schema: schema,
  rootValue: root,
  graphiql: true,
}));
const port = parseInt(process.argv[2], 10) || 80;
app.listen(port);
console.log(`Running a GraphQL API server at http://localhost:${port}/graph`);
app.use((err, req, res, next) => {
    console.log('err:', err);
    next(err);
})