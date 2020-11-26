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

const getFinishedGameIds = async function () {
    const url = 'http://warfish.net/war/play/gamelist?f=2&pp=25';
    const res = await fetch(url);
    const html_str = await res.text();
    const dom_parser = new DOMParser();
    const doc = dom_parser.parseFromString(html_str, 'text/html');
    const anchors = doc.body.querySelectorAll('td nobr a');
    console.log('anchors:', anchors);
    const game_ids = {};
    anchors.forEach(anchor => {
        const params = parseQueryParams(anchor.search);
        if (anchor.pathname === '/game') {
            game_ids[params.gid] = anchor.innerText;
        }
    });
    return game_ids;
};

const getRules = async function (game_id) {
    const url = 'http://warfish.net/war/services/rest?_method=warfish.tables.getDetails&section=rules&_format=json&gid=' + game_id;
    const res = await fetch(url);
    return res.json();
};

const fillOut = async function () {
    const username_el = document.getElementById('username');
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
        const username_el = document.getElementById('username');
        username_el.innerText = params.pid;
    } catch(err) {
        const div = document.createElement('div');
        div.innerText = err;
        const username_el = document.getElementById('username');
        username_el.innerText = 'An error occurred';
        document.body.appendChild(div);
    };

    const finished_game_ids = await getFinishedGameIds();
    const games_list_ul = document.getElementById('games-list');
    let count = 0;
    for (const game_id of Object.keys(finished_game_ids)) {
        if (count >= 10) {
            break;
        }
        const rules = await getRules(parseInt(game_id, 10));
        if (rules.fog !== '0') {
            const li = document.createElement('li');
            li.innerText = finished_game_ids[game_id];
            games_list_ul.appendChild(li);
            count++;
        }
    }
};
fillOut();