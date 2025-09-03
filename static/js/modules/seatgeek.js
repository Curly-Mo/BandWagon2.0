class SeatGeek {
  constructor(namespace = "seatgeek") {
    this.aid = 11799,
    this.client_id = 'NDA0ODEwNnwxNDUxNTIwNTY1';
  }

  get_events(no_recommendations, performers){
    let base_url = 'https://api.seatgeek.com/2/';
    let params = {
      aid: 11799,
      client_id: 'NDA0ODEwNnwxNDUxNTIwNTY1',
      range: window.settings.distance || "20mi",
      'taxonomies.name': ['concert', 'music_festival'],
      'datetime_local.gte': moment().local().startOf('day').add(window.settings.startdate, 'days').format('YYYY-MM-DD'),
      'datetime_local.lte': moment().local().startOf('day').add(window.settings.enddate + 1, 'days').format('YYYY-MM-DD'),
      per_page: 500,
    }
    $('#loader').slideDown();
    $('#loader > .preloader-wrapper').show();
    if(window.settings.custom_location_enable && window.settings.custom_location != ''){
      $('#loading-message').text('Confirming Custom Location...').fadeIn(200);
      let geo = geo_from_address(window.settings.custom_location);
      if(geo == null){
        $('#loader > .preloader-wrapper').hide();
        $('#loading-message')
          .html("<img style='width:300px;' src='/images/dino.gif'></img><br>"
              + "I don't recognize '" + window.settings.custom_location +"'<br>"
              + "Please try typing a different location.");
        setTimeout(function(){
          $('.button-collapse').sideNav('show');
          $('#loader').hide();
          $('#custom_location').select();
        }, 4000);
        return;
      } else {
        params['lat'] = geo.latitude;
        params['lon'] = geo.longitude;
      }
    } else if(window.coordinates) {
      params['lat'] = window.coordinates.latitude;
      params['lon'] = window.coordinates.longitude;
    } else {
      params['geoip'] = true;
    }

    let artist_ids = [];
    let liked_artists = JSON.parse(localStorage.getItem('liked_artists')) || {};
    if(liked_artists !=null && Object.keys(liked_artists).length > 0 && no_recommendations != true){
      base_url += 'recommendations?';
      artist_ids = jQuery.map(liked_artists, function(performer) { if(performer.id != null){return performer.id;}});
    } else {
      base_url += 'events?';
      // If performers given, only get events from those performers
      if(performers != null){
        artist_ids = jQuery.map(performers, function(performer) {
          if(performer.id != null && !(performer.id in window.artists)){
            return performer.id;
          }
        });
        console.log(artist_ids);
        if(artist_ids == null || artist_ids.length == 0){
          return;
        }
      }
    }

    if(no_recommendations == true){
      $('#loading-message').text('Expanding your tastes...').fadeIn(200);
    }else{
      $('#loading-message').text('Finding concerts...').fadeIn(200);
    }

    this.fetch_events_with_retries(base_url, params, artist_ids);
  }

  fetch_events_with_retries(base_url, params, artist_ids, tryCount = 0, retryLimit = 1) {
    let promises = [];
    if (artist_ids.length == 0) {
      let url = base_url + $.param(params, true);
      // console.log(url);
      promises.push(
        fetch(url, {
          method: "GET",
        })
        .then((response) => response.json())
      );
    }
    let remaining_artist_ids = artist_ids;
    while (remaining_artist_ids.length > 0) {
      // endpoint can only take up to 20 performer ids
      // batch them into multiple requests
      let artist_ids_batch = remaining_artist_ids.slice(0, 20)
      remaining_artist_ids = remaining_artist_ids.slice(20)
      params['performers.id'] = artist_ids_batch;
      let url = base_url + $.param(params, true);
      // console.log(url);
      promises.push(
        fetch(url, {
          method: "GET",
        })
        .then((response) => response.json())
      );
    }
    Promise.all(promises).then((responses) => {
      let response_agg = responses[0];
      for(var i=1; i<responses.length; i++){
        let response = responses[i];
        response_agg.recommendations = (response_agg.recommendations || []).concat(response.recommendations || []);
        response_agg.events = ( response_agg.events || []).concat(response.events|| []);
      }
      if(response_agg.recommendations != null){
        response_agg.events = jQuery.map(response_agg.recommendations, function(r){return r.event;});
      }
      if(response_agg.events.length > 0) {
        //$('#loader').closeModal({out_duration: 0});
        window.parse_events(response_agg.events, response_agg.recommendations);
        $('#custom_location').attr("placeholder", response_agg.meta.geolocation.display_name);
      }else if(artist_ids.length != 0){
        console.log(this);
        console.log('no exact matches, nothing to add');
      }else{
        tryCount++;
        if(tryCount <= 10){
          if(response_agg.recommendations != null){
            base_url = base_url.replace('recommendations', 'events');
            $('#loading-message').clearQueue().stop().fadeTo(500, 0.1, function() {
              $(this).text('Expanding your tastes...');
            }).fadeTo(500, 1);
            tryCount--;
          }else{
            if(response_agg.meta.geolocation.display_name == null){
              $('#loader > .preloader-wrapper').hide();
              $('#loading-message').clearQueue().stop().fadeTo(500, 0.1, function() {
                $('#loading-message').html("<img style='width:300px;' src='/images/dino.gif'></img><br>"
                    + "I don't recognize '" + window.settings.custom_location +"'<br>"
                    + "Please try typing a different location."
                );
                setTimeout(function(){
                  $('.button-collapse').sideNav('show');
                  $('#loader').hide();
                  $('#custom_location').select();
                }, 4000);
              }).fadeTo(500, 1);
              return;
            }
            if(tryCount <= 1){
              $('#loading-message').clearQueue().stop().fadeTo(500, 0.1, function() {
                $(this).text('Increasing search radius...');
              }).fadeTo(500, 1);
            }
            params.range = parseFloat(params.range.slice(0,-2)) + 2 + 'mi';
            //params['datetime_local.lte'] = moment(params['datetime_local.lte']).add(1, 'days').format('YYYY-MM-DD'),
          }
          console.log(this);
          console.log(response);
          this.fetch_events_with_retries(base_url, params, artist_ids, tryCount);
        }else{
          $('#loader > .preloader-wrapper').hide();
          $('#loading-message').clearQueue().stop().fadeTo(500, 0.1, function() {
            $(this).html("<img style='width:300px;' src='/images/dino.gif'></img><br>"
                +   "No concerts found in: " + response.meta.geolocation.display_name +"<br>"
                +   "Is this not where you are? Try enabling improved location accuracy in <i class='mdi-navigation-menu'></i>Settings."
            );
          }).fadeTo(200, 1);
        }
      }
    })
    .catch((error) => {
      tryCount++;
      if(tryCount <= retryLimit){
        $('#loading-message').stop().fadeTo(500, 0.1, function() {
            $(this).text('Retrying...');
        }).fadeTo(500, 1);
        this.fetch_events_with_retries(base_url, params, artist_ids, tryCount);
      // }else if(!passthrough){
      //   this.url = passthrough(this.url);
      //   console.log(this);
      //   this.fetch_events_with_retries(passthrough, {'url': base_url + $.param(params, true)}, artist_ids, tryCount);
      }else{
        console.log(error);
        console.log(promises);
        $('#loader > .preloader-wrapper').hide();
        $('#loading-message').html("<img style='width:300px;' src='/images/dino.gif'></img><br>"
            +   "We dun goofed!<br>Sorry, my servers are down right now. Please try again later."
        );
      }
    });
  }
}

export default SeatGeek;
