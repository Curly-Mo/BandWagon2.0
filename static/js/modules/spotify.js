class Spotify {
  constructor(namespace = "spotify") {
    this.store = new mar10.PersistentObject(namespace, {
      defaults: {
        auth: {},
        liked_artists: [],
      },
    });
    this.client_id = '46e30e9499264594a91292ba84d921a1';
    this.client_secret = '19bfbe78e27749f189a46e5721e0575b';
    this.scopes = ['user-top-read'];
    this.state = this.generateRandomString();
    this.init();
  }

  init() {
    let url_params = new URLSearchParams(window.location.hash.replace('#', '?'));
    let expires_in = url_params.get('expires_in') || 3600;
    let auth = {
      access_token: url_params.get('access_token'),
      token_type: url_params.get('token_type'),
      expires_in: expires_in,
      code: url_params.get('code'),
      state: url_params.get('state'),
      expires_at: Date.now() + 1000 * expires_in
    }
    if (auth.access_token && auth.expires_at > Date.now()) {
      this.store.set("auth", auth);
      this.update_liked_artists();
    }
    $('#spotify-import').show();
  }

  generateRandomString() {
    return (Math.random().toString(36)+'00000000000000000').slice(2, 16);
  }

  user_auth(redirect_uri = "http://localhost:8080", scopes = []) {
    let auth = this.store.get("auth");
    if (auth.access_token && auth.expires_at > Date.now()) {
      console.log("already authed");
      return auth;
    }
    let base_url = 'https://accounts.spotify.com/authorize';
    let params = {
      'client_id': this.client_id,
      // something is broken wth the token response
      'response_type': 'token',
      // 'response_type': 'code',
      'scope': [...new Set(this.scopes.concat(scopes))].join(" "),
      'redirect_uri': redirect_uri,
      'state': this.state,
    }
    let query_string = $.param(params, true);
    let url = base_url + '?' + query_string;
    window.location = url;
  }

  // TODO: figure out cross-origin for code authf low
  // user_auth(redirect_url = "http://localhost:8080", scopes = []) {
  //   let base_url = 'https://accounts.spotify.com/authorize';
  //   let params = {
  //       'client_id': this.client_id,
  //       'response_type': 'code',
  //       'scope': [...new Set(this.scopes.concat(scopes))].join(" "),
  //       'redirect_uri': this.redirect_uri,
  //       'state': this.state,
  //   }
  //   let query_string = $.param(params, true);
  //   let url = base_url + '?' + query_string;
  //   let headers = {
  //     'Content-Type': 'application/x-www-form-urlencoded',
  //     'Authorization': `Basic ${btoa(this.client_id + ':' + this.client_secret)}`,
  //   }
  //   return fetch(url, {
  //     method: "GET",
  //     headers: headers,
  //   })
  //   .then((response) => response.json())
  //   .then((response) => {
  //     console.log(`resposne! ${response}`);
  //     return response;
  //   });
  // }

  fetch_user_likes(limit = 200) {
    let auth = this.store.get("auth");
    let base_url = 'https://api.spotify.com/v1/me/top/artists';
    let params = {
      'type': 'artists',
      'time_range': 'long_term',
      'state': this.state,
      'limit': limit,
      'offset': 0,
    }
    let headers = {
      'Authorization': `${auth.token_type} ${auth.access_token}`,
    }
    let promises = [];
    while (limit > 0) {
      if (limit > 50) {
        params.limit = 50;
      }
      let query_string = $.param(params, true);
      let url = base_url + '?' + query_string;
      promises.push(
        fetch(url, {
          method: "GET",
          headers: headers,
        })
        .then((response) => response.json())
      );
      limit = limit - 50;
      params.offset = params.offset + 50;
    }
    return Promise.all(promises)
    .then((responses) => {
      let top_artists_responses = responses;
      let liked_artists = [];
      for(let response of responses) {
        liked_artists = liked_artists.concat(response.items);
      }
      this.store.set("top_artists_responses", top_artists_responses);
      this.store.set("liked_artists", liked_artists);
      return liked_artists;
    });
  }

  update_liked_artists(){
    return this.fetch_user_likes()
    .then((response) => {
      let liked_artists = this.store.get("liked_artists");
      for(var i=0; i<liked_artists.length; i++){
        var artist = liked_artists[i];
        window.add_pref('liked_artists', artist.name);
      }
    })
    .catch((err) => {
      console.warn(err);
      Materialize.toast("Error importing from Spotify", 5000);
    });
  }

  import() {
    this.user_auth();
    this.update_liked_artists();
  }

}

export default Spotify;
