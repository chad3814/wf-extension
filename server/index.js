// @flow strict

const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
 
const sleep = async function (seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
};

// Construct a schema, using GraphQL schema language
const schema = buildSchema(`
  type Query {
    hasHistory(game_id: Int!, user_id: String!): Boolean
  }
  type Mutation {
      sendHistory(game_id: Int!, user_id: String!): Boolean
  }
`);
 
// The root provides a resolver function for each API endpoint
const root = {
  hasHistory: async ({game_id, user_id}) => {
      await sleep(3);
      return false;
  },
  sendHistory: async ({game_id, user_id, history}) => {
      await sleep(5);
      return true;
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
