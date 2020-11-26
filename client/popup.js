const parseQueryParams = function (qs) {
    if (qs[0] === '?') {
        qs = qs.substr(1);
    }
    const ret = {};
    qs.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        ret[decodeURIComponent(key)] = decodeURIComponent(value);
    });
    return ret;
};

const makeGraphqlQuery = async function (query, variables) {
    const url = 'http://localhost:4000/graph';
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    const body = JSON.stringify({query, variables});
    return fetch(url, {headers, body, method: 'POST'}).then(r => r.json());
};

const getFinishedGameIds = async function () {
    const url = 'http://warfish.net/war/play/gamelist?f=2&pp=25';
    const res = await fetch(url);
    const html_str = await res.text();
    const dom_parser = new DOMParser();
    const doc = dom_parser.parseFromString(html_str, 'text/html');
    const anchors = doc.body.querySelectorAll('td nobr a');
    console.log('anchors:', anchors);
    const game_ids = new Map();
    anchors.forEach(anchor => {
        const params = parseQueryParams(anchor.search);
        if (anchor.pathname === '/game') {
            const game_id = parseInt(params.gid, 10);
            game_ids.set(game_id, anchor.innerText);
        }
    });
    return game_ids;
};

const getRules = async function (game_id) {
    const url = 'http://warfish.net/war/services/rest?_method=warfish.tables.getDetails&section=rules&_format=json&gid=' + game_id;
    const res = await fetch(url);
    return res.json();
};

const hasHistoryQuery = `query HasHistory($game_id: Int!, $user_id: String!) {
    hasHistory(game_id: $game_id, user_id: $user_id)
}`;
const sendHistoryMutation = `mutation SendHistory($game_id: Int!, $user_id: String!) {
    sendHistory(game_id: $game_id, user_id: $user_id)
}`;

const sendHistory = async function (li, game_id, user_id) {
    li.appendChild(document.createElement('br'));
    const div = document.createElement('div');
    div.innerText = 'getting history';
    li.appendChild(div);
    console.log('calling makeGraphqlQuery');
    const res = await makeGraphqlQuery(sendHistoryMutation, {game_id, user_id});
    console.log('sendHistory result:', res)
    li.removeChild(div);
};
const fillOut = async function () {
    const username_el = document.getElementById('username');
    let user_id;
    try {
        const res = await fetch('http://warfish.net/war/settings/account', {
            redirect: 'manual'
        });

        if (!res.ok) {
            username_el.innerText = 'You are not logged in';
            return;
        }
        const html =  await res.text();
        const dom_parser = new DOMParser();
        const doc = dom_parser.parseFromString(html, 'text/html');
        const anchor = [...doc.querySelectorAll('a')].filter(a => a.innerText === 'View your profile')[0];
        if (!anchor) {
            throw new Error('Failed to find profile link');
        }
        const params = parseQueryParams(anchor.search);
        user_id = params.pid;
        const username_el = document.getElementById('username');
        username_el.innerText = user_id;
    } catch(err) {
        const div = document.createElement('div');
        div.innerText = err;
        const username_el = document.getElementById('username');
        username_el.innerText = 'An error occurred';
        document.body.appendChild(div);
        return;
    };

    const finished_game_ids = await getFinishedGameIds();
    const games_list_ul = document.getElementById('games-list');
    let count = 0;
    for (const [game_id, title] of finished_game_ids.entries()) {
        if (count >= 10) {
            break;
        }
        const rules = await getRules(game_id);
        if (rules.fog === '0') {
            continue;
        }
        const li = document.createElement('li');
        const a = document.createElement('a');
        const img = document.createElement('img');
        img.src = '/spinner.svg';
        img.height = '16px';
        a.innerText = title;
        a.href = `http://warfish.net/war/play/game?gid=${game_id}`;
        li.appendChild(a);
        li.appendChild(img);
        games_list_ul.appendChild(li);
        makeGraphqlQuery(hasHistoryQuery, {game_id, user_id})
            .then(({data}) => {
                if (data.hasHistory) {
                    img.src = '/check.png';
                } else {
                    img.src = '/up-arrow.png';
                    img.addEventListener('click', () => sendHistory(li, game_id, user_id));
                }
            })
            .catch((err) => {
                console.error('graphql error', err);
            });
        count++;
    }
};
fillOut();