class SoundCloud {
  constructor(callback = () => {}, namespace = "soundcloud") {
    this.store = new mar10.PersistentObject(namespace, {
      defaults: {
        auth: {},
        artists: {},
      },
    });
    this.init().then(callback);
  }

  get auth() {
    return this.store._data.auth;
  }
  set auth(value) {
    this.store.set("auth", value);
  }
  get artists() {
    return this.store._data.artists;
  }
  set artists(value) {
    this.store.set("artists", value);
  }
  get tracks() {
    return this.store._data.tracks;
  }
  set tracks(value) {
    this.store.set("tracks", value);
  }

  auth_header() {
    return `${this.auth.token_type} ${this.auth.access_token}`;
  }

  init() {
    if (this.auth['expires_at'] && this.auth['expires_at'] > Date.now()) {
      return Promise.resolve(this.auth);
    }
    let url = 'https://secure.soundcloud.com/oauth/token';
    let headers = {
      'accept': 'application/json; charset=utf-8',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa('f1686e09dcc2a404eccb6f8473803687:892bd88dc9ec76015dc4620d6af9dc2b')}`,
    }
    let body = {
      'grant_type': 'client_credentials',
    }
    return fetch(url, {
      method: "POST",
      body: new URLSearchParams(body),
      headers: headers,
    })
    .then((response) => response.json())
    .then((response) => {
      response['expires_at'] = Date.now() + (response.expires_in * 1000)
      // this.update_store("auth", response);
      this.store.set("auth", response);
      if (response.expires_in) {
      setTimeout(() => {
          this.init();
        }, response.expires_in * 1000);
      }
      return response;
    });
  }

  fetch_artist_tracks(artist, event_id, limit = 3) {
    let cached = this.artists[artist.id];
    if (cached) {
      return Promise.resolve(cached);
    }
    return fetch(this.artist_tracks_url(artist.name, limit), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.auth_header(),
      },
    })
    .then((response) => response.json())
    .then((response) => {
      // console.log(`artist response: ${response}`);
      return this.parse_tracks(response, event_id, artist.id);
    });
  }

  artist_tracks_url(artist, limit) {
    let base_url = '//api.soundcloud.com/tracks';
    let params = {
        'order': 'hotness',
        'limit': limit,
        'q': artist,
        'username': artist,
    }
    let query_string = $.param(params, true);
    let url = base_url + '?' + query_string;
    return url
  }

  parse_tracks(tracks, event_id, artist_id) {
    let artists = this.artists;
    let artist = artists[artist_id] || {};
    let artist_tracks = artist.tracks || {};
    for(let i = 0; i < tracks.length; i++) {
      let track = tracks[i];
      if(track.streamable){
        track.event_id = event_id;
        track.artist_id = artist_id;
        track.image = track.artwork_url;
        if(!track.image){
          track.image = track.user.avatar_url;
        }
        if(!track.image){
          track.image = 'images/favicon.png';
        }
        artist_tracks[track.id] = track;
      }
    }
    artist.tracks = artist_tracks;
    artists[artist_id] = artist;
    this.artists = artists;
    this.tracks = {...this.tracks, ...artist.tracks};
    return artist;
  }

  fetch_stream(track_id){
    let url = this.tracks[track_id].stream_url;
    return fetch(url, {
      headers: {
        'Authorization': this.auth_header(),
      },
    })
    .then((response) => response.blob());
  }
}

export default SoundCloud;
