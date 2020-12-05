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
  type Color {
    color_id: Int!
    red: Int!
    green: Int!
    blue: Int!
    name: String!
  }
  type Territory {
    territory_id: Int!
    name: String!
    x: Int!
    y: Int!
    text_x: Int!
    text_y: Int!
    can_attack_ids: [Int!]!
    will_defend_ids: [Int!]!
    player_id: Int!
    units: Int!
  }
  type Continent {
    continent_id: Int!
    name: String!
    units: Int!
    territory_ids: [Int!]!
  }
  type Player {
    name: String!
    profile_id: String!
    color: Color!
    is_turn: Boolean!
    is_alive: Boolean!
    reserve_units: Int!
    seat_id: Int!
    territory_ids: [Int!]!
    team_id: Int
    number_of_cards: Int
  }
  type Rules {
    min_units: Int!
    territories_per_unit: Int!
    fog: String!
    card_scale: String!
    blind_at_once: Boolean!
    can_abandon_territories: Boolean!
    keep_possession_of_abandoned: Boolean
    team_game: Boolean!
    can_team_transfer: Boolean
    can_team_place_units: Boolean
    dice: String!
    attacker_die_goal: Int
    defender_die_goal: Int
    allow_pretransfer: Boolean
    allow_return_to_place: Boolean
    allow_return_to_attack: Boolean
    attack_limit_per_turn: Int
    transfer_limit_per_turn: Int
    attacker_die_sides: Int!
    defender_die_sides: Int!
    can_keep_in_reserve: Int
  }
  type Map {
    number_of_territories: Int!
    filled_numbers: Boolean!
    filled_areas: Boolean!
    display_names: Boolean!
    circle_mode: Boolean!
    width: Int!
    height: Int!
    board_id: Int!
    territories: [Territory!]!
    continents: [Continent!]!
  }
  type Cards {
    sets_traded: Int!
    cards_in_discard_pile: Int!
    next_sets: [Int!]!
  }
  type GameData {
    game_id: Int!
    cards: Cards!
    players: [Player!]!
    rules: Rules
    map: Map
  }
  type Query {
    hasHistory(game_id: Int!, user_id: String!): Boolean!
    listGameIds: [Int!]
    listHistoriesForGameId(game_id: Int!): [String!]
    isGameComplete(game_id: Int!): Boolean!
    hasGameData(game_id: Int!): Boolean!
    getGameData(game_id: Int!): GameData
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
    console.log('game_data.players:', game_data.players);
    const promises = game_data.players.map(({profile_id}) => fs.access(`storage/${game_id}/${profile_id}.json`));
    try {
      await Promise.all(promises);
    } catch (err) {
      return false;
    }
    return true;
  },
  hasGameData: async ({game_id}) => {
    return !await fs.access('./storage/${game_id}/data.json');
  },
  getGameData: async ({game_id}) => {
    try {
      return require(`./storage/${game_id}/data.json`);
    } catch (err) {
      return null;
    }
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
app.get('/:game_id', async (req, res, next) => {
  const game_id = parseInt(req.params.game_id, 10);
  const [is_game_complete, histories, data] = await Promise.all([
    root.isGameComplete({game_id}),
    root.listHistoriesForGameId({game_id}),
    root.getGameData({game_id}),
  ]);
  const title = `Game Id: <a href='http://warfish.net/war/play/game?gid=${game_id}'>${game_id}</a/>`;
  const has_data = `Has Data: ${data ? 'Yes' : 'No - <button onclick="() => makeGraphqlQuery(fetch_data_mutation, {game_id:' + game_id + '})">fetch</button>'}`;
  const complete = `${is_game_complete ? 'Game is ready to render' : 'Game is not ready to render'}`;
  const list = histories.map(p => `<li>${p}</li>`);
  return res.end(`<html>
  <head>
    <title>Game Id: ${game_id}</title>
    <script>
    const makeGraphqlQuery = async function (query, variables) {
      const url = 'https://wf-utils.chadshost.xyz/graph';
      const headers = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
      };
      const body = JSON.stringify({query, variables});
      return fetch(url, {headers, body, method: 'POST'}).then(r => r.json());
    };
    const fetch_data_mutation = 'mutation { fetchData(game_id: Int!): Boolean! }';
    </script>
  </head>
  <body>
    <h1>${title}</h1>
    <h2>${complete}</h2>
    <h2>${has_data}</h2>
    <h3>Have histories for:</h3>
    <ul>${list.join('')}</ul>
  </body>
</html>`);
});
app.get('/', async (req, res, next) => {
  const game_ids = await root.listGameIds();
  const list = game_ids.map(g => `<li><a href='/${g}'>${g}</a></li>`);
  return res.end(`<html>
  <head>
    <title>wf-utils</title>
  </head>
  <body>
    <h3><a href='/graph'>graph</a></h3>
    <ul>${list.join('')}</ul>
  </body>
</html>`);
});
app.use((err, req, res, next) => {
  console.log('err:', err);
  next(err);
});
const port = parseInt(process.argv[2], 10) || 80;
app.listen(port);
console.log(`Running a GraphQL API server at http://localhost:${port}/graph`);
