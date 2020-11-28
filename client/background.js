
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

let user_id = null;
const getUserId = async function() {
    if (user_id) {
        return user_id;
    }
    const res = await fetch('http://warfish.net/war/settings/account', {
        redirect: 'manual'
    });

    if (!res.ok) {
        return null;
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
    return user_id;
};

const getFinishedGameIds = async function () {
    const url = 'http://warfish.net/war/play/gamelist?f=2&pp=25';
    const res = await fetch(url);
    const html_str = await res.text();
    const dom_parser = new DOMParser();
    const doc = dom_parser.parseFromString(html_str, 'text/html');
    const anchors = doc.body.querySelectorAll('td nobr a');
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

const _rules = new Map();
const getRules = async function (game_id) {
    if (_rules.has(game_id)) {
        return _rules.get(game_id);
    }
    const url = 'http://warfish.net/war/services/rest?_method=warfish.tables.getDetails&section=rules&_format=json&gid=' + game_id;
    const res = await fetch(url);
    _rules.set(game_id, await res.json());
    return _rules.get(game_id);
};

const hasHistoryQuery = `query HasHistory($game_id: Int!, $user_id: String!) {
    hasHistory(game_id: $game_id, user_id: $user_id)
}`;
const sendHistoryMutation = `mutation SendHistory($game_id: Int!, $user_id: String!, $raw_history: [RawHistory!]) {
    sendHistory(game_id: $game_id, user_id: $user_id, raw_history: $raw_history)
}`;

const makeGraphqlQuery = async function (query, variables) {
    const url = 'http://localhost:4000/graph';
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    const body = JSON.stringify({query, variables});
    return fetch(url, {headers, body, method: 'POST'}).then(r => r.json());
};

const getQueryArg = function (qs, arg) {
    const params = parseQueryParams(qs);
    return qs[arg];
};
const hist_num_date_time_re = /^(?<hist_id>\d+) (?<ts>\d\d\/\d\d \d\d:\d\d:\d\d) (?<other>--- fog ---|Game)?/;
const _histories = new Map();
const getHistory = async function (game_id, start, progress_cb = (done, total) => {}) {
    if (_histories.has(game_id)) {
        return _histories.get(game_id);
    }
    const url = `http://warfish.net/war/play/gamehistory?gid=${game_id}&start=${start}&end=${start + 25}`;
    console.log('fetching:', url);
    const res = await fetch(url);
    //console.log('res:', res);
    const html_str = await res.text();
    const dom_parser = new DOMParser();
    const doc = dom_parser.parseFromString(html_str, 'text/html');
    const total = parseInt(doc.body.querySelector('center center').firstChild.textContent.match(/\d+/)[0], 10);
    const nodes = doc.body.querySelectorAll('table table div nobr');
    const history = [];
    for (const node of nodes) {
        console.log('sending progress:', start + history.length, total);
        progress_cb(start + history.length, total);
        const str = node.childNodes[0].data;
        const match = str.match(hist_num_date_time_re);
        const history_id = parseInt(match.groups.hist_id, 10);
        const date = new Date(match.groups.ts);
        date.setFullYear(2020);
        const obj = {
            history_id,
            ts: date.valueOf(),
        };
        history.push(obj);
        if (match.groups.other) {
            continue;
        }
        obj.player = node.childNodes[1].text;
        if (node.childNodes[1].search) {
            obj.seat_id = parseInt(getQueryArg(node.childNodes[1].search, 'seat'), 10);
            obj.action = node.childNodes[3].innerText;
        }
        //console.log(obj);
        let rest_index = 4;
        if (obj.action === 'attacks' || obj.action === 'eliminates' || obj.action === 'captures') {
            if (node.childNodes[4].data.startsWith(' Neutral')) {
                obj.opponent = 'Neutral';
                obj.opponent_seat_id = -1;
                node.childNodes[4].data = node.childNodes[4].data.substr(9);
            } else {
                obj.opponent = node.childNodes[5].text;
                obj.opponent_seat_id = parseInt(getQueryArg(node.childNodes[5].search, 'seat'), 10);
            }
            if (obj.action === 'attacks' && obj.opponent_seat_id !== -1) {
                rest_index = 6;
            }
        }
        obj.rest = node.childNodes[rest_index].data;
    }

    if (history.length === 25) {
        const subrequest = await getHistory(game_id, start + 25, progress_cb);
        //console.log('subrequest:', subrequest);
        return history.concat(subrequest);
    }
    progress_cb(total, total);
    _histories.set(game_id, history);
    return history;
};

const _has_histories = new Map();
const hasHistory = async function (game_id) {
    if (_has_histories.has(game_id)) {
        return _has_histories.get(game_id);
    }
    const {data} = await makeGraphqlQuery(hasHistoryQuery, {game_id, user_id});
    _has_histories.set(game_id, data.hasHistory);
    return _has_histories.get(game_id);
}
const sendHistory = async function (game_id) {
    if (!_histories.has(game_id)) {
        throw new Error('NoHistory');
    }
    const raw_history = _histories.get(game_id);
    const {data} = await makeGraphqlQuery(sendHistoryMutation, {game_id, user_id, raw_history});
    _has_histories.set(game_id, data.sendHistory);
};

chrome.runtime.onInstalled.addListener(function() {
    // Replace all rules ...
    chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
      // With a new rule ...
      chrome.declarativeContent.onPageChanged.addRules([
        {
          // That fires when on a warfish page
          conditions: [
            new chrome.declarativeContent.PageStateMatcher({
              pageUrl: {
                  hostEquals: 'warfish.net'
              }
            })
          ],
          // And shows the extension's page action.
          actions: [ new chrome.declarativeContent.ShowPageAction() ]
        }
      ]);
    });
    window.sendHistory = sendHistory;
    window.hasHistory = hasHistory;
    window.getHistory = getHistory;
    window.getRules = getRules;
    window.getFinishedGameIds = getFinishedGameIds;
    window.getUserId = getUserId;
  });
