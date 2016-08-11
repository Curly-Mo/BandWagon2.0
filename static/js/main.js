"use strict";
//window.addEventListener("load", init, false);
var settings = {
    'autoplay': false,
    'geolocation': false,
    'startdate': 0,
    'enddate': moment().local().startOf('day').add(1, 'months').diff(moment().local().startOf('day'), 'days'),
    'distance': '20mi',
    'custom_location_enable': false,
    'custom_location': '',
}
init();
function init(){
    if(navigator.userAgent.toLowerCase().indexOf('firefox') > -1 && navigator.appVersion.toLowerCase().indexOf("win") > -1){
        Materialize.toast("This page does not run well in Firefox. Use Chrome for a better experience.", 5000)
    }
    if(navigator.userAgent.toLowerCase().indexOf('msie ') > -1 ||
       navigator.userAgent.toLowerCase().indexOf('trident/') >-1 ||
       navigator.userAgent.toLowerCase().indexOf('edge/') > -1){
        Materialize.toast("This page does not run well in Internet Exporer. I recommend Chrome for the best experience.", 5000)
    }
    var new_settings = localStorage.getItem('settings');
    if(new_settings){
        window.settings = JSON.parse(new_settings);
    }
    refresh_playlist();

    // Initialize collapse button
    $('.button-collapse').sideNav({
        menuWidth: 300, // Default is 240
        edge: 'left', // Choose the horizontal origin
        //closeOnClick: true // Closes side-nav on <a> clicks, useful for Angular/Meteor
    });

    $('#play-button').on('tap click', play_toggle);
    $('#prev-button').on('tap click', prev);
    $('#next-button').on('tap click', next);
    init_settings();
    init_volume();
    init_audio();
    init_track_actions();
    document.addEventListener('keydown', keydown, false)
    $('#show-playlist').on('tap click', function(){
        active_pane($('#playlist-pane'));
    });

    $('.modal-trigger').leanModal();
    init_search();
    $('.arrow').slideDown();
    $('#start-listening').fadeIn(800);
    $('#venue-listen').on('tap click', function(e){
        play_artists(null, null, this.getAttribute('data-id'));
    });
    $('#artist-listen').on('tap click', function(e){
        play_artists([this.getAttribute('data-id')]);
    });
    $('#artist-heart').on('change', function(e){
        if(this.checked){
            add_pref('liked_artists', this.getAttribute('data-id'));
        }else{
            remove_pref('liked_artists', this.getAttribute('data-id'));
        }
    });
}

var audioCtx;
var audio;
var audio_source;
var gain_node;
var events = {};
var artists = {};
var venues= {};
var tracks = {};
var promises = [];
var coords;

function init_audio(){
    audio = new Audio();
    audio.crossOrigin = "anonymous";
    if(window.AudioContext || window.webkitAudioContext){
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audio_source = audioCtx.createMediaElementSource(audio);
        gain_node = audioCtx.createGain();
        audio_source.connect(gain_node);
        gain_node.connect(audioCtx.destination);
        var volume = document.querySelector('#volume-slider');
        gain_node.gain.value = volume.noUiSlider.get()/100.0;
        volume.noUiSlider.on('update', function(){
            gain_node.gain.value = volume.noUiSlider.get()/100.0;
        });
    }
    audio.addEventListener('ended', next);
    $('body').append(audio);
}

var first_play = true;
function play(){
    if(first_play){
        init_progress();
        first_play = false;
    }
    audio.play();
    var e = $('#play');
    if(e.html() == 'play_arrow'){
        e.stop().fadeTo('fast', 0.1, function() {
            e.html('pause');
        }).fadeTo('fast', 1);
    }
}

function pause(){
    audio.pause();
    var e = $('#play');
    if(e.html() == 'pause'){
        e.stop().fadeTo('fast', 0.1, function() {
            e.html('play');
        }).fadeTo('fast', 1);
    }
}

function play_toggle(){
    $('#start-listening').addClass('disabled');
    $('#start-listening').removeClass('waves-effect');
    $('#start-listening').attr('onclick', '');
    var e = $('#play');
    if(e.html() == 'play_arrow'){
        if(!document.querySelector('.playlist-item.active')){
            if($('.playlist-item').length == 0){
                window.settings.autoplay = true;
            }else{
                $('.playlist-item').first().trigger('click');
            }
        }else{
            audio.play();
        }
        e.stop().stop(true, true).fadeTo('fast', 0.1, function() {
            e.html('pause');
        }).fadeTo('fast', 1);
    }else{
        audio.pause();
        e.stop().stop(true, true).fadeTo('fast', 0.1, function() {
            e.html('play_arrow');
        }).fadeTo('fast', 1);
    }
}

function next(){
    var curr = $('.playlist-item.active');
    if(curr.length == 0){
        $('.playlist-item').first().trigger('click');
    }else{
        curr.nextAll('.playlist-item:first').click();
    }
}

function prev(){
    var curr = $('.playlist-item.active')
    curr.prevAll('.playlist-item:first').click();
}

function init_volume(){
    var slider = document.querySelector('#volume-slider');
    noUiSlider.create(slider, {
        start: 80, // Handle start position
        connect: 'lower', // Display a colored bar between the handles
        direction: 'rtl', // Put '0' at the bottom of the slider
        orientation: 'vertical',
        behaviour: 'snap',
        //tooltips: wNumb({decimals: 0}),
        range: {
            'min': 0,
            'max': 100
        },
    });
    var volume_button = document.querySelector('#volume-button');
    volume_button.addEventListener("mouseover", show_volume, false);
    volume_button.addEventListener("touchstart", show_volume, false);
    var timer;
    function show_volume(){
        window.clearTimeout(timer);
        $('#volume-container').fadeIn('fast');
        timer = setTimeout(hide_volume, 3 * 1000);
    }
    var volume_container = document.querySelector('#volume-container');
    volume_container.addEventListener("mouseleave", hide_volume, false);
    volume_container.addEventListener("onfocusout", hide_volume, false);
    volume_container.addEventListener("mouseover", show_volume, false);
    volume_container.addEventListener("touchstart", show_volume, false);
    function hide_volume(){
        $('#volume-container').fadeOut('slow');
    }
}

function init_progress(){
    var slider = document.querySelector('#progress');
    noUiSlider.create(slider, {
        start: 0,
        connect: 'lower',
        behaviour: 'snap',
        animate: true,
        range: {
            'min': 0,
            'max': 100
        },
    });
    audio.addEventListener('timeupdate', updateProgress, false);
    slider.noUiSlider.on('slide', set_progress);
    function set_progress(value){
        audio.currentTime = value / (100 / audio.duration); 
    }
    var progress_container= document.querySelector('#progress-container');
    progress_container.addEventListener('mouseover', showWaveform, false);
    progress_container.addEventListener('mouseleave', hideWaveform, false);
    function showWaveform(){
        $('#waveform, #track-length, #track-time').fadeIn(100);
        $('#progress').clearQueue().stop().animate({ height: '80px' }, 'easeInOutCubic');
    }
    function hideWaveform(){
        $('#waveform, #track-length, #track-time').fadeOut('fast');
        $('#progress').clearQueue().stop().animate({ height: '4px' }, 'easeInOutCubic');
    }
}
function updateProgress() {
    var value = 0;
    if (audio.currentTime > 0) {
        value = (100 / audio.duration) * audio.currentTime;
    }
    var slider = document.querySelector('#progress');
    slider.noUiSlider.set(value);
    if(audio.duration){
        $('#track-length').text(formatSeconds(audio.duration));
    }
    if(audio.duration){
        $('#track-time').text(formatSeconds(audio.currentTime));
    }
    $('#track-time').css('left', value + '%');
    if(value > 95){
        $('#track-time').fadeOut('slow');
    }
}

function clear_modal(){
    // Refresh loading message
    //console.log('fixing modal');
    $('#loader > .preloader-wrapper').show();
}

function get_events(no_recommendations, performers){
    var base_url = 'https://api.seatgeek.com/2/';
    var params = {
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
        var geo = geo_from_address(window.settings.custom_location);
        if(geo == null){
            $('#loader > .preloader-wrapper').hide();
            $('#loading-message').html("<img style='width:300px;' src='/images/dino.gif'></img><br>"
                +   "I don't recognize '" + window.settings.custom_location +"'<br>"
                +   "Please try typing a different location."
            );
            setTimeout(function(){
                $('.button-collapse').sideNav('show');
                $('#loader').hide();
                $('#custom_location').select();
            }, 4000);
            return;
        }else{
            params['lat'] = geo.latitude;
            params['lon'] = geo.longitude;
        }
    }else if(window.coordinates){
        params['lat'] = window.coordinates.latitude;
        params['lon'] = window.coordinates.longitude;
    }else{
        params['geoip'] = true;
    }

    var liked_artists = JSON.parse(localStorage.getItem('liked_artists'));
    if(liked_artists !=null && Object.keys(liked_artists).length > 0 && no_recommendations != true){
        base_url += 'recommendations?';
        var artist_ids = jQuery.map(liked_artists, function(performer) { if(performer.id != null){return performer.id;}});
        params['performers.id'] = artist_ids;
    }else{
        base_url += 'events?';
        // If performers given, only get events from those performers
        if(performers != null){
            var artist_ids = jQuery.map(performers, function(performer) {
                if(performer.id != null && !(performer.id in window.artists)){
                    return performer.id;
                }
            });
            console.log(artist_ids);
            if(artist_ids == null || artist_ids.length == 0){
                return;
            }
            params['performers.id'] = artist_ids;
        }
    }


    var url = base_url + $.param(params, true);
    //console.log(url);
    if(no_recommendations == true){
        $('#loading-message').text('Expanding your tastes...').fadeIn(200);
    }else{
        $('#loading-message').text('Finding concerts...').fadeIn(200);
    }
    $.ajax({
        url: url,
        tryCount : 0,
        retryLimit : 1,
        timeout: 20000,
        cache: true,
        complete: function(){
            //$('#loader').closeModal();
        },
        success: function(response){
            if(response.recommendations != null){
                response.events = jQuery.map(response.recommendations, function(r){return r.event;});
            }
            if(response.events.length > 0) {
                //$('#loader').closeModal({out_duration: 0});
                parse_events(response.events, response.recommendations);
                $('#custom_location').attr("placeholder", response.meta.geolocation.display_name);
            }else{
                this.tryCount++;
                if(this.tryCount <= 10){
                    if(response.recommendations != null){
                        base_url = base_url.replace('recommendations', 'events');
                        delete params['performers.id'];
                        $('#loading-message').clearQueue().stop().fadeTo(500, 0.1, function() {
                            $(this).text('Expanding your tastes...');
                        }).fadeTo(500, 1);
                        this.tryCount--;
                    }else{
                        if(response.meta.geolocation.display_name == null){
                            $('#loader > .preloader-wrapper').hide();
                            $('#loading-message').clearQueue().stop().fadeTo(500, 0.1, function() {
                                $('#loading-message').html("<img style='width:300px;' src='/images/dino.gif'></img><br>"
                                    +   "I don't recognize '" + window.settings.custom_location +"'<br>"
                                    +   "Please try typing a different location."
                                );
                                setTimeout(function(){
                                    $('.button-collapse').sideNav('show');
                                    $('#loader').hide();
                                    $('#custom_location').select();
                                }, 4000);
                            }).fadeTo(500, 1);
                            return;
                        }
                        if(this.tryCount <= 1){
                            $('#loading-message').clearQueue().stop().fadeTo(500, 0.1, function() {
                                $(this).text('Increasing search radius...');
                            }).fadeTo(500, 1);
                        }
                        params.range = parseFloat(params.range.slice(0,-2)) + 2 + 'mi';
                        //params['datetime_local.lte'] = moment(params['datetime_local.lte']).add(1, 'days').format('YYYY-MM-DD'),
                    }
                    this.url = base_url + $.param(params, true);
                    console.log(this);
                    console.log(response);
                    $.ajax(this);
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
        },
        error: function (response, status, error) {
            this.tryCount++;
            if(this.tryCount <= this.retryLimit){
                $('#loading-message').stop().fadeTo(500, 0.1, function() {
                    $(this).text('Retrying...');
                }).fadeTo(500, 1);
                $.ajax(this);
            }else if(this.passthrough == null){
                this.passthrough = true;
                this.url = passthrough(this.url);
                console.log(this);
                $.ajax(this);
            }else{
                console.log(response);
                console.log(status);
                console.log(error);
                $('#loader > .preloader-wrapper').hide();
                $('#loading-message').html("<img style='width:300px;' src='/images/dino.gif'></img><br>"
                    +   "We dun goofed!<br>Sorry, my servers are down right now. Please try again later."
                );
            }
        },
    });
}

function passthrough(url){
    var base_url = 'passthrough?';
    var params = {
        'url': url,
    }
    return base_url +  $.param(params, true);
}

function shuffle(o){
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
}

function parse_events(events, recommendations){
    var max_events = 50;
    events = shuffle(events);
    events = apply_event_preferences(events);
    for(var i = 0; i < Math.min(events.length, max_events); i++) {
        (function (i) {
            var event = events[i];
            window.events[event.id] = event;
            window.venues[event.venue.id] = event.venue;
            for(var j = 0; j < event.performers.length; j++) {
                (function (j) {
                    var performer = event.performers[j];
                    window.artists[performer.id] = performer;
                    promises.push(
                        $.ajax({
                            url: soundcloud_url(performer.name, 3),
                            dataType: 'json',
                            cache: true,
                            beforeSend: function() {
                                $('#loader').slideDown();
                                $('#loader > .preloader-wrapper').show();
                                $('#loading-message').clearQueue().stop().fadeTo(500, 0.1, function() {
                                    $(this).text('Loading tracks...');
                                }).fadeTo(500, 1);
                            },
                            success: function(response){
                                parse_tracks(response, event.id, performer.id);
                            }
                        })
                    );
                })(j);
            }
        })(i);
    }
    $.when.apply($, promises).then(function() {
        // returned data is in arguments[0][0], arguments[1][0], ... arguments[9][0]
        $('#loader').slideUp();
        load_tracks(create_track_list());
        promises.length = 0;
    }, function(e) {
        // error occurred
        console.log(e);
        $('#loader').slideUp();
        // Try to load anyway
        load_tracks(create_track_list());
        promises.length = 0;
    });
    if(recommendations != null){
        if(events.length < 5){
            console.log('not enough recommendations, adding all events');
            get_events(true);
        }else {
            var liked_artists = JSON.parse(localStorage.getItem('liked_artists'));
            if(liked_artists != null){
                console.log(liked_artists);
                console.log('grab liked artist events, in case recommendations missed them');
                get_events(true, liked_artists);
            }
        }
    }
}

function soundcloud_url(artist, limit){
    var base_url = '//api.soundcloud.com/tracks';
    var params = {
        'client_id': 'f1686e09dcc2a404eccb6f8473803687',
        'order': 'hotness',
        'limit': limit,
        'q': artist,
        'username': artist,
    }
    var query_string = $.param(params, true);
    var url = base_url + '?' + query_string;
    return url
}

function soundcloud_stream_url(track_id){
    var base_url = tracks[track_id].stream_url;
    var params = {
        'client_id': 'f1686e09dcc2a404eccb6f8473803687',
    }
    var query_string = $.param(params, true);
    var url = base_url + '?' + query_string;
    return url
}

function parse_tracks(tracks, event_id, artist_id){
    for(var i = 0; i < tracks.length; i++) {
        var track = tracks[i];
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
            window.tracks[track.id] = track;
        }
    }
}

function load_tracks(track_list){
    var track_limit = 100;
    if(isMobile()){
        var track_limit = 25;
    }
    var liked_artists = JSON.parse(localStorage.getItem('liked_artists')) || {};
    for(var i = 0; i < Math.min(track_list.length, track_limit); i++) {
        var track = track_list[i];
        var playlist_item = $('<li>').attr({'class': 'collection-item avatar playlist-item', 'data-id': track.id})
                .append($('<img>').attr({'class': 'image', 'src': track.image}))
                .append($('<span>').attr('class', 'title').html(window.artists[track.artist_id].name))
                .append($('<p>').html(track.title))
                .append($('<a>').addClass('secondary-content waves-effect waves-light btn').append($('<i>').addClass('material-icons').text('info_outline')));
        if(track.artist_id in liked_artists){
            var pos = Math.min(rand_int(0, 6), $('.playlist-item').length-1);
            playlist_item.insertBefore($('.playlist-item')[pos]);
            delete liked_artists[track.artist_id];
            console.log('Prioritizing track:');
            console.log(playlist_item);
        }else{
            $('#playlist').append(playlist_item);
        }
    }
    $('#playlist').clearQueue().stop().css('height', '').slideDown(Math.min(track_list.length, track_limit)*150);
    $('.playlist-item').on('tap click', function(e){
        // Need to check correct target since Hammer doesn't prevent bubbling with onTap
        if(e.gesture && $(e.gesture.target).closest('.secondary-content')){
            return
        }
        play_item.call(this);
    });
    $('.playlist-item .secondary-content').on('tap click', function(e) {
        var track = window.tracks[$(e.target).parents('[data-id]').attr('data-id')];
        //console.log(track);
        if(track.event_id == null){
            set_artist_info(track.artist_id);
            active_pane($('#artist-pane'));
        }else{
            set_event_info(track.event_id, track.artist_id);
            active_pane($('#event-pane'));
        }
        return false;
    });
    if(track_limit < track_list.length){
        var more = $('<a>').attr({'class': 'collection-item center', href: 'javascript:void(0)'}).text('Load more');
        $('#playlist').append(more);
        more.on('tap click', function(e){
            e.preventDefault();
            $(this).off();
            load_tracks(track_list.slice(track_limit));
            more.slideUp('medium');
        });
    }
    if(!isMobile() && window.settings.autoplay && audio.paused){
        $('.playlist-item').first().trigger('click');
    }
//    }else if($('#play').html() != 'pause'){
//        var track = window.tracks[$('.playlist-item').first().attr('data-id')];
//        set_event_info(track.event_id, track.id);
//        document.querySelector('#waveform').setAttribute('src', track.waveform_url);
//    }
    //init_dismissables();
}

function create_track_list(){
    var arr = Object.keys(window.tracks).map(function (key) {return window.tracks[key]});
    arr = shuffle(arr);
    arr = apply_track_preferences(arr);
    return arr;
}

function play_item(){
    if(this.classList.contains('active')){
        return;
    }
    $('.playlist-item.active').removeClass('active');
    play_track(this.getAttribute('data-id'));
    this.classList.add('active');
    $('#track-actions').stop(true, true).hide();//.slideUp(300);
    // Scroll to top
    var self = this;
    $(this).parent().parent().clearQueue().stop().animate({
        scrollTop: $(this).offset().top - $(this).parent().offset().top,// - $('#track-actions')[0].scrollHeight
    }, 600, function(){
        show_track_actions.call(self);
    });
    if($(this).parent().children().last().text() == 'Load more' && $(this).parent().children().length - $(this).parent().children().index(this) < 5){
        $(this).parent().children().last().trigger('click');
    }
}

function play_track(track_id){
    //bullshit to make safari not crash
    audio.remove();
    audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio_source.disconnect();
    audio_source = audioCtx.createMediaElementSource(audio);
    audio_source.connect(gain_node);
    audio.addEventListener('ended', next);
    audio.addEventListener('timeupdate', updateProgress, false);
    $('body').append(audio);
    //audio.pause();
    //audio.removeAttribute("src"); 
    ////
    audio.src = soundcloud_stream_url(track_id)
    play();
    document.querySelector('#waveform').setAttribute('src', tracks[track_id].waveform_url);
    var track = tracks[track_id];
    $('#now-playing').clearQueue().stop().fadeTo(900, 0.05, function() {
        $('#now-playing > img').attr("src", track.image);
        $('#now-playing-artist').text(window.artists[track.artist_id].name);
        $('#now-playing-title').text(track.title);
    }).fadeTo(1000,1);
    if(track.event_id == null){
        set_artist_info(track.artist_id);
    }else{
        set_event_info(track.event_id, track.artist_id);
    }
    try{
        ga('send', 'event', 'play',
            window.artists[track.artist_id].name,
            track.title
        );
    }catch(e){
        console.log(e);
    }
}

function keydown(e){
    if ($(e.target).is('input, textarea')) {
        return;   
    }
    switch (e.keyCode) {
        case 38: //up
            break;
        case 40: //down
            break;
        case 37: //left
            prev()
            break;
        case 39: //right
            next()
            break;
        case 32: //space
            e.preventDefault();
            play_toggle();
            break;
    }
}

function clear_playlist(){
    $('#playlist').clearQueue().stop().css('height', '').slideUp(200);
    $('#playlist').empty();
}
function refresh_playlist() {
    clear_playlist();
    if(window.settings.geolocation && 'geolocation' in navigator && !window.coordinates){
        $('#loader').slideDown();
        $('#loader > .preloader-wrapper').show();
        $('#loading-message').text('Determining your location...').fadeIn(200);;
        var success = function(position) {
            window.coordinates = position.coords;
            //console.log(window.coordinates);
            window.tracks = {};
            get_events();
        };
        var error = function(position) {
            window.tracks = {};
            get_events();
        };
        navigator.geolocation.getCurrentPosition(success, error, {maximumAge:60*60*1000, timeout:8000, enableHighAccuracy: false});
    }else{
        window.tracks = {};
        get_events();
    }
}

//function init_dismissables(){
//    var swipeLeft = false;
//    var swipeRight = false;
//    $('.dismissable').each(function() {
//        $(this).hammer({
//            prevent_default: false
//        }).bind('pan', function(e) {
//            if (e.gesture.pointerType === "touch") {
//                var $this = $(this);
//                var direction = e.gesture.direction;
//                var x = e.gesture.deltaX;
//                var velocityX = e.gesture.velocityX;
//
//                $this.velocity({ translateX: x
//                    }, {duration: 50, queue: false, easing: 'easeOutQuad'});
//                // Swipe Left
//                if (direction === 4 && (x > ($this.innerWidth() / 2) || velocityX < -0.75)) {
//                    swipeLeft = true;
//                }
//                // Swipe Right
//                if (direction === 2 && (x < (-1 * $this.innerWidth() / 2) || velocityX > 0.75)) {
//                    swipeRight = true;
//                }
//            }
//      }).bind('panend', function(e) {
//        // Reset if collection is moved back into original position
//        if (Math.abs(e.gesture.deltaX) < ($(this).innerWidth() / 2)) {
//            swipeRight = false;
//            swipeLeft = false;
//        }
//        if (e.gesture.pointerType === "touch") {
//            var $this = $(this);
//            if (swipeLeft || swipeRight) {
//                var fullWidth;
//                if (swipeLeft) { fullWidth = $this.innerWidth(); }
//                else { fullWidth = -1 * $this.innerWidth(); }
//                $this.velocity({ translateX: fullWidth,
//                    }, {duration: 100, queue: false, easing: 'easeOutQuad', complete:
//                    function() {
//                        $this.css('border', 'none');
//                        $this.velocity({ height: 0, padding: 0,
//                            }, {duration: 200, queue: false, easing: 'easeOutQuad', complete:
//                            function() { $this.remove(); }
//                        });
//                    }
//                });
//            }
//            else {
//                $this.velocity({ translateX: 0,
//                }, {duration: 100, queue: false, easing: 'easeOutQuad'});
//            }
//            swipeLeft = false;
//            swipeRight = false;
//        }
//    });
//    });
//}

function isMobile(){
    if(navigator.userAgent.match(/ipad|iphone|ipod|android|blackberry|opera mini|iemobile/i)){
        return true;
    }
    return false;
}

function init_settings(){
    /*$('.datepicker').pickadate({
        selectMonths: true,
        selectYears: 2,
        today: 'Today',
        clear: false,
        close: 'cancel',
        container: 'main',
        closeOnSelect: true,
    });*/
    var datepicker = $('#datestart').dateRangePicker({
        separator : ' to ',
        format: 'YYYY-MM-DD',
        autoClose: true,
        container:'main',
        showTopbar: false,
        startDate: moment().local().format(),
        setValue: function(s,s1,s2){
            if(!$(this).is(':disabled') && s != $(this).val()){
                $('#datestart').val(s1);
                $('#dateend').val(s2);
            }
        },
        getValue: function()
        {
            if ($('#datestart').val() && $('#dateend').val())
                return $('#datestart').val() + ' to ' + $('#dateend').val();
            else
                return '';
        },
    });
    var datepicker = $('#dateend').dateRangePicker({
        separator : ' to ',
        format: 'YYYY-MM-DD',
        autoClose: true,
        container:'main',
        showTopbar: false,
        startDate: moment().local().format(),
        setValue: function(s,s1,s2){
            if(!$(this).is(':disabled') && s != $(this).val()){
                $('#datestart').val(s1);
                $('#dateend').val(s2);
            }
        },
        getValue: function()
        {
            if ($('#datestart').val() && $('#dateend').val())
                return $('#datestart').val() + ' to ' + $('#dateend').val();
            else
                return '';
        },
    });

    var slider = document.querySelector('#distance');
    noUiSlider.create(slider, {
        start: 20,
        connect: 'lower',
        behaviour: 'snap',
        step: 1,
        animate: true,
        tooltips: true,
        range: {
            'min': 1,
            'max': 100
        },
        format: {
            to: function ( value ) {
                return value + 'mi';
            },
            from: function ( value ) {
                return value.slice(0, -2);;
            }
        },
    });
    $('#geolocation').on('change', function() {
        if(this.checked) {
            navigator.geolocation.getCurrentPosition(function(position){
                window.coordinates = position.coords;
                //console.log(window.coordinates);
            }, null, {maximumAge:60*60*1000, timeout:8000, enableHighAccuracy: false});
        }
    });

    $('.drag-target').on('click touchstart', update_settings);
    $('body').on('click touchstart', '#sidenav-overlay', update_settings);
    load_settings();
    $('#show-likes, #show-dislikes').on('click', function(){
        load_preferences();
        facebook_init();
    });
    //$('#add_liked_artist, #add_liked_genre, #add_disliked_artist, #add_disliked_genre').on('keydown', add_pref);
    $('#add_liked_artist, #add_disliked_artist').on('keydown', function(){
        if (event.keyCode == 13) {
            var pref_type = this.parentNode.previousElementSibling.id;
            var preferences = JSON.parse(localStorage.getItem(pref_type)) || {};
            add_pref(pref_type, this.value);
            this.value = '';
        }
    });
    $('#custom_location').on('input', function(){
        if(this.value == ''){
            $('#custom_location_enable').prop('checked', false);
        }else{
            $('#custom_location_enable').prop('checked', true);
        }
    });
    $('#custom_location').on('keydown', function(e){
        if(e.which == 13){
            $('.drag-target').click();
        }
    });
}

function load_settings(){
    //var new_settings = localStorage.getItem('settings');
    //if(new_settings){
    //    window.settings = JSON.parse(new_settings);
    //}
    $('#datestart').data('dateRangePicker').setDateRange(
        moment().local().startOf('day').add(window.settings.startdate, 'days').format(),
        moment().local().startOf('day').add(window.settings.enddate, 'days').format()
    );
    document.querySelector('#distance').noUiSlider.set(window.settings.distance);
    document.querySelector('#autoplay').checked = window.settings.autoplay;
    document.querySelector('#geolocation').checked = window.settings.geolocation;

    document.querySelector('#custom_location_enable').checked = window.settings.custom_location_enable;
    document.querySelector('#custom_location').value = window.settings.custom_location;
}

function update_settings(){
    var new_settings = {
        'autoplay': document.querySelector('#autoplay').checked,
        'geolocation': document.querySelector('#geolocation').checked,
        'startdate': moment($('#datestart').val()).local().startOf('day').diff(moment().local().startOf('day'), 'days'),
        'enddate': moment($('#dateend').val()).local().startOf('day').diff(moment().local().startOf('day'), 'days'),
        'distance': document.querySelector('#distance').noUiSlider.get(),
        'custom_location_enable': document.querySelector('#custom_location_enable').checked,
    }
    if(document.querySelector('#custom_location_enable').checked){
        new_settings['custom_location'] = document.querySelector('#custom_location').value;
    }else{
        new_settings['custom_location'] = '';
    }
    if(JSON.stringify(window.settings) !== JSON.stringify(new_settings)){
        //console.log(window.settings);
        //console.log(new_settings);
        window.settings = new_settings;
        localStorage['settings'] = JSON.stringify(new_settings);
        refresh_playlist();
    }
}

function formatSeconds(seconds){
    var date = new Date(null);
    date.setSeconds(seconds);
    var timestring = date.toISOString().substr(11, 8);
    timestring = timestring.replace(/^0+/, '')
    timestring = timestring.replace(/^:+/, '')
    timestring = timestring.replace(/^0/, '')
    return timestring
}

function set_event_info(event_id, artist_id){
    $('#welcome').fadeOut().remove();
    if(window.eventinfo == event_id){
        $('#event-artists > * > .collapsible-header').removeClass('active');
        $('#event-artists > [data-artist-id='+artist_id+'] > .collapsible-header').addClass('active');
        //console.log($('#event-artists > [data-artist-id='+artist_id+'] > .collapsible-header'));
        $('#event-artists').collapsible();
        return;
    }
    window.eventinfo = event_id;
    var event = events[event_id];
    // Title
    $('#event-title').clearQueue().stop().fadeTo('medium', 0.1, function() {
        $(this).text(event.title);
    }).fadeTo('medium', 1);
    // Venue
    var maps_url = '//maps.google.com/?';
    var params = {
        'q': event.venue.name,
        'sll': event.venue.location.lat+','+event.venue.location.lon,
        //'z': 15,
    }
    maps_url = maps_url + $.param(params, true);
    $('#event-venue').clearQueue().stop().fadeTo('medium', 0.1, function() {
        $(this).html('@ ');
        var venue_link = $('<a>').text(event.venue.name).attr({
            'href': 'javascript:void(0)',
            'data-id': event.venue.id,
        });
        venue_link.on('tap click', function(e){
            set_venue_info(this.getAttribute('data-id'));
            active_pane($('#venue-pane'));
        }); 
        $(this).append(venue_link);
    }).fadeTo('medium', 1);
    // Date
    var time = '';
    if(!event.time_tbd){
        time = moment(event.datetime_local).format('h:mma');
    }
    var calendar_url = '//www.google.com/calendar/event?';
    var params = {
        'action': 'TEMPLATE',
        'text': event.title,
        'dates': moment(event.datetime_local).format('YYYYMMDDTHHmmss') +'/'+ moment(event.datetime_local).format('YYYYMMDDTHHmmss'),
        'location': event.venue.name,
        //TODO
        'details': 'Lineup:\n',
        'trp': false,
        'sprop': [
            'name:Band Wagon',
            'website:bandwagon.pl',
        ],
    }
    for(var i=0;i<event.performers.length;i++){
        params.details += event.performers[i].name + '\n';
    }
    calendar_url = calendar_url + $.param(params, true);
    $('#event-date').clearQueue().stop().fadeTo('medium', 0.1, function() {
        $(this).find('a').text(moment(event.datetime_local).format('dddd, MMM Do'));
        $(this).find('a').attr('href', calendar_url);
    }).fadeTo('medium', 1);
    $('#event-time').clearQueue().stop().fadeTo('medium', 0.1, function() {
        $(this).text(time);
    }).fadeTo('medium', 1);
    // Tickets
    $('#event-tickets').clearQueue().stop().fadeTo('medium', 0.1, function() {
         $(this).find('a').attr('href', event.url);
         $(this).find('a').text('Purchase Tickets');
    }).fadeTo('medium', 1);
    $('#event-lineup').clearQueue().stop().fadeTo('medium', 0.1, function() {
        if(event.performers.length > 1){
            var listen = $('<a>').html('♫Listen to Lineup♫').attr({
                'href': 'javascript:void(0)',
                'data-id': event.id,
            });
            listen.on('tap click', function(e){
                play_artists(null, this.getAttribute('data-id'));
            });
            $(this).html(listen);
        }else{
            $(this).empty();
        }
    }).fadeTo('medium', 1);
    // Artists
    $('#event-artists').clearQueue().stop().fadeTo('medium', 0.1, function() {
        $(this).empty();
        for(var i=0;i<event.performers.length;i++){
            var artist = event.performers[i];
            var item = $('<li>').addClass('artist-item').attr('data-artist-id', artist.id);
            var header = $('<div>').addClass('collapsible-header').text(artist.name);
            var el = $('<div>').addClass('collapsible-body');
            item.append(header).append(el);
            $(this).append(item);
            if(artist.id == artist_id || event.performers.length == 1){
                item.children().first().addClass('active');
            }
            lastfm_artist_info(artist.id, el);
            //echonest_artist_info(artist.id);
            var listen = $('<a>').addClass('right').html('♫Listen♫').attr({
                'href': 'javascript:void(0)',
                'data-id': artist.id,
            });
            header.append(listen);
            listen.on('tap click', function(e){
                e.preventDefault();
                e.stopPropagation();
                play_artists([this.getAttribute('data-id')]);
            });
        }
        $(this).collapsible();
    }).fadeTo('medium', 1);
    get_official_ticket_url(event.url);
}

function lastfm_artist_info(artist_id, el){
    var apiKey = "812ddaf7105675342e456ebf4eab4e92";
    var lastfm_url = 'http://ws.audioscrobbler.com/2.0/?';
    var params = {
        'api_key': apiKey,
        'method': 'artist.getinfo',
        'artist': artists[artist_id].name,
        'format': 'json',
    }
    var url = lastfm_url  + $.param(params, true);
    //console.log(url)
    $.ajax({
        url: url,
        tryCount : 0,
        retryLimit : 1,
        timeout: 10000,
        dataType: 'json',
        cache: true,
        success : function(data) {
            var artist_profile = data.artist;
            //console.log(artist_profile);
            var body = el;//$('.artist-item[data-artist-id="' + artist_id  + '"] .collapsible-body');
            if(typeof artist_profile === "undefined"){
                body.append($('<p>').text('Unknown artist'));
                return;
            }
            if(typeof artist_profile.bio.content !== "undefined" && artist_profile.bio.content !== ""){
                body.append($('<label>').text('Bio:'))
                    .append($('<p>').html(lastfm_bio(artist_profile.bio)));
            }
            if(typeof artist_profile.tags.tag[0] !== "undefined"){
                var terms = artist_profile.tags.tag.map(function(term) {return term.name;}).join(', ');
                body.append($('<label>').text('Genre:'))
                    .append($('<p>').text(terms));
            }
            if(typeof artist_profile.similar.artist[0] !== "undefined"){
                var similar = artist_profile.similar.artist.slice(0,5).map(function(a) {return a.name;}).join(', ');
                body.append($('<label>').text('Similar Artists:'))
                    .append($('<p>').text(similar));
            }
            if(body.parent().parent().attr('id') == 'event-artists'){
                var artist_page = $('<a>').attr({
                    'href': 'javascript:void(0)',
                    'data-id': artist_id,
                }).text('see all shows');
                body.append($('<p>').addClass('right').append(artist_page));
                artist_page.on('tap click', function(e){
                    set_artist_info(this.getAttribute('data-id'));
                    active_pane($('#artist-pane'));
                });
            }
            if(artist_profile.image[0]['#text'] != null && artist_profile.image[0]['#text'] != ''){
                var slider = $('<div>').addClass('center').css({'width': '90%', 'margin-top': '8px'});
                var image = $('<img>').css({'max-width': '100%', 'max-height': '100%'});
                for(var i = 0; i < artist_profile.image.length; i++) {
                    image.attr('src', artist_profile.image[i]['#text']);
                    if(artist_profile.image[i].size == 'mega'){
                        break;
                    }
                }
                body.append(slider.append(image));
            }else{
                body.append($('<br>'));
            }
        }
    });
}

function echonest_artist_info(artist_id){
    var apiKey = "8C0DI9VHHE8BZSPOP";
    //var id = "jambase:artist:"+artistID;
    var echonest_url = 'http://developer.echonest.com/api/v4/artist/profile?';
    var params = {
        'api_key': apiKey,
        'name': artists[artist_id].name,
        'bucket': [
            'biographies',
            'familiarity',
            'hotttnesss',
            'images',
            'artist_location',
            'news',
            'reviews',
            'urls',
            'video',
            'years_active',
            'terms',
            'genre',
            'reviews',
            'years_active',
        ],
        'format': 'json',
    }
    var url = echonest_url + $.param(params, true);
    //console.log(url)
    $.ajax({
        url: url,
        tryCount : 0,
        retryLimit : 1,
        timeout: 10000,
        dataType: 'json',
        cache: true,
        success : function(data) {
            var artist_profile = data.response.artist;
            //console.log(artist_profile);
            var body = $('.artist-item[data-artist-id="' + artist_id  + '"] .collapsible-body');
            if(typeof artist_profile === "undefined"){
                body.append($('<p>').text('Unknown artist'));
                return;
            }
            if(typeof artist_profile.biographies[0] !== "undefined"){
                body.append($('<label>').text('Bio:'))
                    .append($('<p>').html(best_bio(artist_profile.biographies)))
            }
            if(typeof artist_profile.terms[0] !== "undefined"){
                var terms = artist_profile.terms.map(function(term) {return term.name;}).join(', ');
                body.append($('<label>').text('Genre:'))
                    .append($('<p>').text(terms));
            }
            if(typeof artist_profile.artist_location !== "undefined" && typeof artist_profile.artist_location.location !== "undefined"){
                body.append($('<label>').text('Hometown:'))
                    .append($('<p>').text(artist_profile.artist_location.location));
            }
            if(typeof artist_profile.urls !== "undefined"){
                if(Object.keys(artist_profile.urls).length > 0){
                    var p = $('<p>');
                    body.append($('<label>').text('Links:')).append(p);
                    for(var key in artist_profile.urls) {
                        if(key == 'mb_url'){continue;}
                        if(key == 'official_url'){
                            p.prepend($('<div>').append($('<a>').attr({'href': artist_profile.urls[key], 'target': '_blank'}).text(key.replace('_url',''))));
                        }else{
                            p.append($('<div>').append($('<a>').attr({'href': artist_profile.urls[key], 'target': '_blank'}).text(key.replace('_url',''))));
                        }
                    }
                }
            }
            if(typeof artist_profile.images[0] !== "undefined"){
                var slider = $('<div>').addClass('slider center').css('width', '80%');
                var slides = $('<ul>').addClass('slides');
                for(var i = 0; i < artist_profile.images.length; i++) {
                    if(artist_profile.images[i].url.indexOf('userserve-ak.last.fm') == -1){
                        slides.append($('<li>').append($('<img>').attr('src', artist_profile.images[i].url)));
                    }
                }
                if(slides.children().length > 0){
                    body.append(slider.append(slides));
                    slider.slider({
                        indicators: true,
                        height: 300,
                        transition: 1200,
                        interval: 6000,
                        full_width: false,
                    });
                }
            }
            //if(typeof artistProfile.video[0] !== "undefined"){
            //    $("#info-artist-videos").html(getVideos(artistProfile.video));  
            //}
        }
    });
}

function lastfm_bio(bio) {
    var text = bio.content;
    text = text.replace(/<a href="http(s):\/\/www\.last\.fm\/music(.*)Read more on Last\.fm\<\/a\>./, "");
    text = text.replace(/User-contributed text is available under the Creative Commons By-SA License; additional terms may apply./, "");

    if(text.length > 600){
        var end_index = 600 + text.substring(600).indexOf('.') + 1;
        text = text.substring(0, end_index);
        text += " <a target='_blank' href='" + bio.links.link.href + "'>Read More</a>";
    }
    return text;
}

function best_bio(bios) {
    var best = null;
    var text;
    if (bios.length > 0) {
        best = bios[0];
        for (var i = 0; i < bios.length; i++) {
            if (bios[i].site == 'wikipedia') {
                best = bios[i];
            }
            if (bios[i].site == 'last.fm' && best.site != 'wikipedia') {
                best = bios[i];
            }
        }
    }
    text = best.text.replace(/Contents\n\n1[\s\S]*edit:/,"<br>");
    if(text.length > 600){
        var end_index = 600 + text.substring(600).indexOf('.') + 1;
        text = text.substring(0, end_index);
        text += " <a target='_blank' href='" + best.url + "'>Read More</a>";
    }
    return text;
}

function active_pane(pane){
    $('.pane.right').not(pane).animate({width:'hide'}, 350, function(){
        this.classList.add('hide-on-small-only');   
        if(pane.hasClass('left')){
            $(this).show();
        }
    });
    //console.log($('.pane').not(pane).not($('#playlist-pane')));
    if(window.matchMedia('(max-width: 600px)').matches){
        $('#playlist-pane').not(pane).animate({width:'hide'}, 350, function(){
            this.classList.add('hide-on-small-only');   
            $(this).show();
        });  
        if(pane.attr('id') != 'playlist-pane'){
            $('#show-playlist').fadeTo('slow', 1);
        }
    }else{
        $('#playlist-pane').not(pane).addClass('hide-on-small-only');   
        if(pane.attr('id') != 'playlist-pane'){
            $('#show-playlist').fadeTo('slow', 1);
        }

    }
    pane.attr('width', 'hide');
    pane.removeClass('hide-on-small-only');   
    pane.animate({width:'show'}, 350, function(){
    });  
    pane.removeClass('hide');
    if(pane.attr('id') == 'playlist-pane'){
       $('#show-playlist').fadeTo('slow', 0);
    }
}

function play_artists(artist_ids, event_id, venue_id){
    if(window.matchMedia('(max-width: 600px)').matches){
        active_pane($('#playlist-pane'));
    }
    if(artist_ids == null && event_id != null){
        var ev = window.events[event_id];
        artist_ids = jQuery.map(ev.performers, function(performer) { return performer.id; });
        for(var a=0; a<artist_ids.length; a++){
            window.artists[artist_ids[a]].event_id = event_id;
        }
    }
    if(artist_ids == null && event_id == null && venue_id != null){
        var venue = window.venues[venue_id];
        artist_ids = [];
        for(var i=0; i<venue.events.length; i++){
            var ev = venue.events[i];
            var ids = jQuery.map(ev.performers, function(performer) { return performer.id; });
            for(var a=0; a<ids.length; a++){
                window.artists[ids[a]].event_id = ev.id;
            }
            artist_ids = artist_ids.concat(ids);
        }
    }
    clear_playlist();
    window.tracks = {};
    var tracks_per = Math.max(Math.floor(15-10*Math.log10(artist_ids.length)), 3);
    for(var i = 0; i < artist_ids.length; i++) {
        (function (i) {
            var performer = artists[artist_ids[i]];
            promises.push(
                $.ajax({
                    url: soundcloud_url(performer.name, tracks_per),
                    dataType: 'json',
                    cache: true,
                    beforeSend: function() {
                        $('#loader').slideDown();
                        $('#loader > .preloader-wrapper').show();
                        $('#loading-message').clearQueue().stop().fadeTo(500, 0.1, function() {
                            $(this).text('Loading tracks...');
                        }).fadeTo(500, 1);
                    },
                    success: function(response){
                        parse_tracks(response, performer.event_id, performer.id);
                    }
                })
            );
        })(i);
    }
    $.when.apply($, promises).then(function() {
        // returned data is in arguments[0][0], arguments[1][0], ... arguments[9][0]
        $('#loader').slideUp();
        load_tracks(create_track_list());
        promises.length = 0;
    }, function(e) {
        // error occurred
        console.log(e);
        $('#loader').slideUp();
        // Try to load anyway
        load_tracks(create_track_list());
        promises.length = 0;
    });
}

function init_track_actions(){
    $(document.body).on('click', '#thumb_up', function(){
        var track_id = $(this).parent().prev().attr('data-id');
        var track = tracks[track_id];
        var liked_artists = JSON.parse(localStorage.getItem('liked_artists')) || {};
//        var liked_genres = JSON.parse(localStorage.getItem('liked_genres')) || {};
        var name = artists[track.artist_id].name;
        var artist_id = artists[track.artist_id].id;
        if(!(artist_id in liked_artists)){
            liked_artists[artist_id] = {'id': artist_id, 'name': name};
            localStorage.setItem('liked_artists', JSON.stringify(liked_artists));
            var action = "delete_pref('liked_artists', '" + artist_id +"');" + 'this.parentNode.remove()';
            Materialize.toast('Liked artist: ' + name + ' <a class="btn waves-effect waves-light" onclick="'+action+'">undo</a>', 4000, 'action-toast');
        }
//        if(track.genre && !(track.genre in liked_genres)){
//            liked_genres[track.genre.toLowerCase()] = track.genre;
//            localStorage.setItem('liked_genres', JSON.stringify(liked_genres));
//            var action = "delete_pref('liked_genres', '" + track.genre.toLowerCase()+"');" + 'this.parentNode.remove()';
//            Materialize.toast('Liked genre: ' + track.genre + ' <a class="btn waves-effect waves-light" onclick="'+action+'">undo</a>', 4000, 'action-toast');
//        }
        $(this).parent().slideUp(400);
        try{
            ga('send', 'event', 'thumb_up',
                name,
                artist_id
            );
        }catch(e){
            console.log(e);
        }
    });
    $(document.body).on('click', '#thumb_down', function(){
        var track_id = $(this).parent().prev().attr('data-id');
        var track = tracks[track_id];
        var disliked_artists = JSON.parse(localStorage.getItem('disliked_artists')) || {};
//        var disliked_genres = JSON.parse(localStorage.getItem('disliked_genres')) || {};
        var name = artists[track.artist_id].name;
        var artist_id = artists[track.artist_id].id;
        if(!(name.toLowerCase() in disliked_artists)){
            disliked_artists[artist_id] = {'id': artist_id, 'name': name};
            localStorage.setItem('disliked_artists', JSON.stringify(disliked_artists));
            var action = "delete_pref('disliked_artists', '" + artist_id +"');" + 'this.parentNode.remove()';
            Materialize.toast('Disliked artist: ' + name + ' <a class="btn waves-effect waves-light" onclick="'+action+'">undo</a>', 4000, 'action-toast');
        }
//        if(track.genre && !(track.genre.toLowerCase in disliked_genres)){
//            disliked_genres[track.genre.toLowerCase()] = track.genre;
//            localStorage.setItem('disliked_genres', JSON.stringify(disliked_genres));
//            var action = "delete_pref('disliked_genres', '" + track.genre.toLowerCase()+"');" + 'this.parentNode.remove()';
//            Materialize.toast('Disliked genre: ' + track.genre + ' <a class="btn waves-effect waves-light" onclick="'+action+'">undo</a>', 4000, 'action-toast');
//        }
        $(this).parent().slideUp(400);
        try{
            ga('send', 'event', 'thumb_down',
                name,
                artist_id
            );
        }catch(e){
            console.log(e);
        }
        next();
    });
}

function show_track_actions(){
    var active = $(this);
    var track_actions = $('#track-actions');
    if(track_actions.length == 0){
        track_actions = $('<li>').attr('id', 'track-actions')
            .append($('<a>', {
                    'id': 'thumb_down',
                    'class': 'waves-effect waves-light btn',
                }).append($('<i>', {
                    'class': 'material-icons',
                    'text': 'thumb_down',
                })))
            .append($('<a>', {
                    'id': 'thumb_up',
                    'class': 'waves-effect waves-light btn',
                }).append($('<i>', {
                    'class': 'material-icons',
                    'text': 'thumb_up',
                })));
    }
    var pref_types = [
        'liked_artists',
//        'liked_genres',
        'disliked_artists',
//        'disliked_genres',
    ];
    var preferences = {};
    for(var i = 0; i < pref_types.length; i++){
        var pref = JSON.parse(localStorage.getItem(pref_types[i])) || {};
        preferences = jQuery.extend(preferences, pref);
    }
    var track = tracks[active.attr('data-id')];
    if(!(track.artist_id in preferences)){
        track_actions.insertAfter(active).stop(true, true).slideDown(600);
    }
}

function load_preferences(){
    var preferences = [
        'liked_artists',
//        'liked_genres',
        'disliked_artists',
//        'disliked_genres',
    ];
    for(var i = 0; i < preferences.length; i++){
        var pref = JSON.parse(localStorage.getItem(preferences[i])) || {};
        var el = $('#'+preferences[i]);
        el.empty();
        var keys = Object.keys(pref).sort(function(a,b){
            try{
                var nameA = pref[a].name.toLowerCase();
                var nameB = pref[b].name.toLowerCase();
                if (nameA < nameB) {
                    return -1;
                }
                if (nameA > nameB) {
                    return 1;
                }
                return 0;
            }catch(e){
                return 0;
            }
        });
        for(var k = 0; k < keys.length; k++){
            // In case junk got in there (i.e. from an older version of BandWagon)
            if(pref[keys[k]].name == null || pref[keys[k]].id == null){
                delete pref[keys[k]];
                localStorage.setItem(preferences[i], JSON.stringify(pref));
                continue;
            }
            var close = $('<i>', {
                'class': 'material-icons',
                'text': 'close',
            });
            el.append(
                $('<div>', {
                    'class': 'chip',
                    'text': pref[keys[k]].name,
                    'data-id': pref[keys[k]].id,
                }).append(close)
            );
            close.on('click', function(){
                remove_pref($(this).parent().parent().attr('id'), this.parentNode.getAttribute('data-id'));
            });
        }
    }
}

function remove_pref(pref_type, value){
    var preferences = JSON.parse(localStorage.getItem(pref_type)) || {};
    delete preferences[value]
    localStorage.setItem(pref_type, JSON.stringify(preferences));
}

function add_pref(pref_type, value){
    if(value == null || value == ''){
        return;
    }
    if(window.artists[value]){
        var preferences = JSON.parse(localStorage.getItem(pref_type)) || {};
        preferences[value] = {'id': value, 'name': window.artists[value].name};
        localStorage.setItem(pref_type, JSON.stringify(preferences));
        load_preferences();
        return;
    }
    var term = value;
    var base_url = 'https://api.seatgeek.com/2/performers?';
    var params = {
        'client_id': 'NDA0ODEwNnwxNDUxNTIwNTY1',
        'aid': 11799,
        'q': term,
        'taxonomies.name': ['concert', 'music_festival'],
        'per_page': 20,
        'format': 'json',
    }
    var url = base_url + $.param(params, true);
    $.ajax({
        url: url,
        timeout: 10000,
        cache: true,
        pref_type: pref_type,
        success : function(data) {
            var exact_match = data.performers.find(function(el){
                return el.name.toLowerCase() == term.toLowerCase();
            });
            if(exact_match){
                data.performers = [exact_match];
            }
            var artist = data.performers[0]
            var preferences = JSON.parse(localStorage.getItem(this.pref_type)) || {};
            preferences[artist.id] = {'id': artist.id, 'name': artist.name};
            localStorage.setItem(this.pref_type, JSON.stringify(preferences));
            load_preferences();
        },
    });
    try{
        ga('send', 'event', pref_type, value);
    }catch(e){
        console.log(e);
    }
}

function delete_pref(pref_type, pref){
    var preferences = JSON.parse(localStorage.getItem(pref_type)) || {};
    delete preferences[pref]
    localStorage.setItem(pref_type, JSON.stringify(preferences));
    console.log(this);
}

function apply_event_preferences(events){
    var liked_artists = JSON.parse(localStorage.getItem('liked_artists')) || {};
    var disliked_artists = JSON.parse(localStorage.getItem('disliked_artists')) || {};
    if(liked_artists != null && Object.keys(liked_artists).length > 0 || disliked_artists != null &&Object.keys(disliked_artists).length > 0){
        for(var i = 0; i < events.length; i++){
            var event = events[i];
            var performers = jQuery.map(event.performers, function(performer) { return performer.id; });
            // Move liked artist events to the front of the list
            if(performers.some(function(v) { return v in liked_artists; })){
                events.splice(i, 1);
                events.unshift(event);
                console.log('Moving to front:');
                console.log(event);
            // Remove disliked artist events
            }else if(performers.some(function(v){return v in disliked_artists;})){
                if(event.type != 'music_festival'){
                    events.splice(i, 1);
                    i--;
                    console.log('Removing event:');
                    console.log(event);
                }
            }
        }
    }
    return events;
}

function apply_track_preferences(tracks){
    var liked_artists = JSON.parse(localStorage.getItem('liked_artists')) || {};
//    var liked_genres = JSON.parse(localStorage.getItem('liked_genres')) || {};
//    var disliked_genres = JSON.parse(localStorage.getItem('disliked_genres')) || {};
    //if(Object.keys(liked_artists).length > 0 || Object.keys(liked_genres).length > 0 || Object.keys(disliked_genres).length > 0){
    if(liked_artists != null && Object.keys(liked_artists).length > 0){
        for(var i = 0; i < tracks.length; i++){
            var track = tracks[i];
            // Move liked artists close to the top of playlist
            if(track.artist_id in liked_artists){
                tracks.splice(i, 1);
                tracks.splice(rand_int(0, 6), 0, track); 
                delete liked_artists[track.artist_id];
                console.log('Prioritizing track:');
                console.log(track);
            }
            // Move liked genres close to the top of playlist
//            }else if(track.genre && track.genre.toLowerCase() in liked_genres){
//                tracks.splice(i, 1);
//                tracks.splice(rand_int(0, 8), 0, track); 
//                delete liked_genres[track.genre.toLowerCase()];
//                console.log('Prioritizing track:');
//                console.log(track);
//            // Remove tracks of disliked genres
//            }else if(track.genre && track.genre.toLowerCase() in disliked_genres){
//                tracks.splice(i, 1);
//                i--;
//                console.log('Removing track:');
//                console.log(track);
//            }
        }
    }
    return tracks;
}

function rand_int(min, max){
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function echonest_analyze(track_id){
    var stream_url = soundcloud_stream_url(track_id);
    var apiKey = "8C0DI9VHHE8BZSPOP";
    var echonest_url = 'http://developer.echonest.com/api/v4/track/upload?';
    var params = {
        'api_key': apiKey,
        'url': stream_url,
        'format': 'json',
    }
    var url = echonest_url + $.param(params, true);
    //console.log(url)
    $.ajax({
        url: url,
        timeout: 10000,
        method: 'POST',
        crossDomain: true,
        dataType: 'json',
        contentType: 'application/x-www-form-urlencoded',
        cache: true,
        success : function(data) {
            var response = data.response;
            console.log(response);
        },
    });
}

function get_city(){
    var url = '//www.geoplugin.net/json.gp?'
    if(window.coordinates){
        url += 'lat=' + window.coordinates.latitude + '&';
        url += 'long=' + window.coordinates.longitude + '&';
    }
    url += 'jsoncallback=?';
    //console.log(url);
    $.getJSON(url, 
        function(data){
            $('#custom_location').attr("placeholder", data.geoplugin_city +', ' + data.geoplugin_regionCode);
        }
    );
}

function geo_from_address(address){
    var base_url = 'https://maps.googleapis.com/maps/api/geocode/json?';
    var params = {
        'key': 'AIzaSyAxT696F5cHCzGxozFpAD--kmLWiCGzByo',
        'address': address,
    }
    var url = base_url + $.param(params, true);
    var data = $.ajax({ 
        url: url,
        async: false,
        dataType: 'json',
    }).responseJSON;
    if(data.results[0] == null){
        return null;
    }
    var custom_geo = {
        'latitude': data.results[0].geometry.location.lat,
        'longitude': data.results[0].geometry.location.lng,
    }
    window.custom_geo = custom_geo;
    return custom_geo;
}

function get_official_ticket_url(ticket_url){
    var url = '//cors-anywhere.herokuapp.com/' + ticket_url;
    var data = $.ajax({ 
        url: url,
        type: 'GET',
        dataType: 'text',
        success: function(data) {
          var s = data.split('Official Box Office');
          if(s.length <= 1){
              return;
          }
          s = s[0].split('href').pop();
          s = s.split('"')[1];
          $('#event-tickets a').attr('href', s);
          //console.log(s);
        }
    });
}

function init_search(){
    $('#search-button').on('tap click', function(e){
        this.classList.add('always-hide');
        var search = $('#search');
        $('#search').parent().addClass('always-show');
        $('#search').focus();
        $('#search').one('blur', function(e){
            this.parentElement.classList.remove('always-show');
            $('#search-button').removeClass('always-hide');
        });
    });
    $('#search').on('focus', function(e){
        this.select();
        this.setAttribute('placeholder', 'artist or venue');
        $(this).parent().css({'width': '400px'});
    });
    $('#search').on('blur', function(e){
        this.setAttribute('placeholder', 'Search');
        $(this).parent().css({'width': '20%'});
    });
    $('#search-icon').on('tap click', function(e){
        if($('#search').val() == ''){
            $('#search').focus();
        }else{
            search($('#search').val());
        }
    });
    $('#search').on('keydown', function(e){
        if(e.which == 13){
            search(this.value);
            this.blur();
            return false;
        }
    });
}

var search_term = '';
var search_semaphore = 0;
function search(term){
    search_term = term;
    $('#search-spinner').show();
    $('#search-message').text('Searching for ' + term + '...');
    $('#search-results > .collection-item').remove();
    active_pane($('#search-pane'));
    search_artists(term);
    search_venues(term);
}

function search_artists(term){
    window.search_semaphore += 1;
    var base_url = 'https://api.seatgeek.com/2/performers?';
    var params = {
        'client_id': 'NDA0ODEwNnwxNDUxNTIwNTY1',
        'aid': 11799,
        'q': term,
        'taxonomies.name': ['concert', 'music_festival'],
        'per_page': 20,
        'format': 'json',
    }
    var url = base_url + $.param(params, true);
    $.ajax({
        url: url,
        tryCount : 0,
        retryLimit : 1,
        timeout: 10000,
        dataType: 'jsonp',
        cache: true,
        success : function(data) {
            window.search_semaphore -= 1;
            if(window.search_semaphore <= 0){
                $('#search-spinner').hide();
                $('#search-message').text('Search results');
            }
            var exact_match = data.performers.find(function(el){
                return el.name.toLowerCase() == term.toLowerCase();
            });
            if(exact_match){
                data.performers = [exact_match];
            }
            for(var i=0; i<data.performers.length && i < 5; i++){
                var performer = data.performers[i];
                window.artists[performer.id] = performer;
                var item = $('<a>').attr({'class': 'collection-item', href: 'javascript:void(0)', 'data-id': performer.id})
                        .append($('<span>').text('Artist: ').css('color', 'white'))
                        .append($('<span>').text(performer.name));
                $('#search-results').append(item);
                item.on('tap click', function(e){
                    set_artist_info(this.getAttribute('data-id'));
                    active_pane($('#artist-pane'));
                });
            }
        },
    });
}

function search_venues(term){
    window.search_semaphore += 1;
    var base_url = 'https://api.seatgeek.com/2/venues?';
    var params = {
        'client_id': 'NDA0ODEwNnwxNDUxNTIwNTY1',
        'aid': 11799,
        'q': term,
        'range': window.settings.distance || "100mi",
        'format': 'json',
        'per_page': 20,
    }
    if(window.coordinates){
        params['lat'] = window.coordinates.latitude;
        params['lon'] = window.coordinates.longitude;
    }else if(window.custom_geo){
        params['lat'] = window.custom_geo.latitude;
        params['lon'] = window.custom_geo.longitude;
    }else{
        params['geoip'] = true;
    }
    var url = base_url + $.param(params, true);
    //console.log(url);
    $.ajax({
        url: url,
        tryCount : 0,
        timeout: 10000,
        dataType: 'jsonp',
        cache: true,
        success : function(data) {
            if(data.venues.length == 0 && this.tryCount == 0){
                delete params['range'];
                delete params['geoip'];
                delete params['lat'];
                delete params['lon'];
                this.url = base_url + $.param(params, true);
                this.tryCount++;
                $.ajax(this);
                return
            }
            window.search_semaphore -= 1;
            if(window.search_semaphore <= 0){
                $('#search-spinner').hide();
                $('#search-message').text('Search results');
            }
            var exact_matches = data.venues.filter(function(el){
                return el.name.toLowerCase() == term.toLowerCase();
            });
            if(exact_matches.length == 1){
                data.venues = exact_matches;
            }
            for(var i=0; i<data.venues.length && i < 5; i++){
                var venue = data.venues[i];
                window.venues[venue.id] = venue;
                var item = $('<a>').attr({'class': 'collection-item', href: 'javascript:void(0)', 'data-id': venue.id})
                        .append($('<span>').text('Venue: ').css('color', 'white'))
                        .append($('<span>').text(venue.name))
                        .append($('<span>').text(venue.display_location).css('float', 'right'));
                $('#search-results').append(item);
                item.on('tap click', function(e){
                    set_venue_info(this.getAttribute('data-id'));
                    active_pane($('#venue-pane'));
                });
            }
        },
    });
}

function set_artist_info(artist_id){
    if(window.artistinfo == artist_id){
        return;
    }
    window.artistinfo = artist_id;
    var artist = artists[artist_id];
    // Title
    $('#artist-title').clearQueue().stop().fadeTo('medium', 0.1, function() {
        $(this).text(artist.name);
    }).fadeTo('medium', 1);
    // Like button
    $('#artist-heart').attr({
        'data-id': artist_id,
    });
    var liked_artists = JSON.parse(localStorage.getItem('liked_artists'));
    if(artist_id in liked_artists){
        $('#artist-heart').prop('checked', true);
    }else{
        $('#artist-heart').prop('checked', false);
    }
    $('#artist-info').empty();
    $('#artist-listen').hide();
    lastfm_artist_info(artist_id, $('#artist-info'));
    $('#artist-events > .collection-item').remove();
    artist_events(artist_id, $('#artist-events'));
}

function set_venue_info(venue_id){
    if(window.venueinfo == venue_id){
        return;
    }
    window.venueinfo = venue_id;
    var venue = venues[venue_id];
    // Title
    $('#venue-title').clearQueue().stop().fadeTo('medium', 0.1, function() {
        $(this).text(venue.name);
    }).fadeTo('medium', 1);
    $('#venue-events > .collection-item').remove();
    $('#venue-info').empty();
    $('#venue-listen').hide();
    venue_events(venue_id, $('#venue-events'));

    var maps_url = 'https://www.google.com/maps/embed/v1/place?';
    var params = {
        'q': venue.name + ', ' + venue.extended_address,
        'key': 'AIzaSyDQ-AFM5aQaD1HX3bSXuKMCh-zpphnxcaI',
    }
    maps_url = maps_url + $.param(params, true);
    var maps_embed = $('<iframe>');
    maps_embed.attr({
        'src': maps_url,
        'frameborder': 0,
        'allowfullscreen': '',
        'width': 600,
        'height': 450,
    });
    maps_embed.css({
        'width': '90%',
        'height': Math.max(document.documentElement.clientHeight, window.innerHeight || 0)/2,
        'border': 0,
    });
    $('#venue-info').append(maps_embed);
}

function artist_events(artist_id, el){
    var base_url = 'https://api.seatgeek.com/2/events?';
    var params = {
        'aid': 11799,
        'client_id': 'NDA0ODEwNnwxNDUxNTIwNTY1',
        'performers.id': artist_id,
        'taxonomies.name': ['concert', 'music_festival'],
        'per_page': 50,
    }
    var url = base_url + $.param(params, true);
    //console.log(url)
    $.ajax({
        url: url,
        timeout: 20000,
        dataType: 'jsonp',
        cache: true,
        success: function(response){
            if(response.events.length <= 0){
                el.append($('<div>').html('<span style="font-size:4;">☹</span> No upcoming concerts <span style="font-size:4;">☹</span>').addClass('collection-item center'));
            }
            for(var i=0; i<response.events.length; i++){
                var event = response.events[i];
                window.events[event.id] = event;
                var date = moment(event.datetime_local).format('L').slice(0,-5);
                var item = $('<a>').attr({
                    'class': 'collection-item',
                    href: 'javascript:void(0)',
                    'data-id': event.id
                })
                    .append($('<span>').css('float', 'right')
                                .append($('<span>').text(event.venue.display_location).css('padding', '0 8px 0 4px'))
                                .append($('<span>').text(date).css('color', 'white'))
                    )
                    .append($('<span>').text(event.venue.name).css('color', 'white').addClass('truncate'));
                el.append(item);
                item.on('tap click', function(e) {
                    var event_id = this.getAttribute('data-id');
                    set_event_info(event_id);
                    active_pane($('#event-pane'));
                });

                for(var a=0; a<event.performers.length; a++){
                    window.artists[event.performers[a].id] = event.performers[a];
                }
            }
            $('#artist-listen').attr('data-id', artist_id);
            $('#artist-listen').fadeIn();
        },
    });
}

function venue_events(venue_id, el){
    var base_url = 'https://api.seatgeek.com/2/events?';
    var params = {
        'aid': 11799,
        'client_id': 'NDA0ODEwNnwxNDUxNTIwNTY1',
        'venue.id': venue_id,
        'taxonomies.name': ['concert', 'music_festival'],
        'per_page': 200,
    }
    var url = base_url + $.param(params, true);
    //console.log(url)
    $.ajax({
        url: url,
        timeout: 20000,
        dataType: 'jsonp',
        cache: true,
        success: function(response){
            window.venues[venue_id].events = response.events;
            for(var i=0; i<response.events.length; i++){
                var event = response.events[i];
                window.events[event.id] = event;
                var date = moment(event.datetime_local).format('L').slice(0,-5);
                var item = $('<a>').attr({
                    'class': 'collection-item',
                    'href': 'javascript:void(0)',
                    'data-id': event.id
                })
                    .append($('<span>').css('float', 'right')
                                .append($('<span>').text(event.venue.display_location).css('padding', '0 8px 0 4px'))
                                .append($('<span>').text(date).css('color', 'white'))
                    )
                    .append($('<span>').text(event.title).css('color', 'white').addClass('truncate'));
                el.append(item);
                item.on('tap click', function(e) {
                    var event_id = this.getAttribute('data-id');
                    set_event_info(event_id);
                    active_pane($('#event-pane'));
                });

                for(var a=0; a<event.performers.length; a++){
                    window.artists[event.performers[a].id] = event.performers[a];
                }
            }
            $('#venue-listen').attr('data-id', venue_id);
            $('#venue-listen').fadeIn();
        },
    });
}


function facebook_init(){
    window.fbAsyncInit = function() {
        FB.init({
            appId      : '1696944990518859',
            xfbml      : true,
            version    : 'v2.7'
        });
        $('#facebook-import').show();
    };
    (function(d, s, id){
        var js, fjs = d.getElementsByTagName(s)[0];
        if (d.getElementById(id)) {return;}
        js = d.createElement(s); js.id = id;
        js.src = "//connect.facebook.net/en_US/sdk.js";
        fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'facebook-jssdk'));
}
function facebook_login(){
    FB.getLoginStatus(function(response) {
        if (response.status === 'connected') {
            console.log('Logged in.');
            facebook_get_music();
        }
        else {
            FB.login(function(response) {
                facebook_get_music();
            }, {scope: 'user_likes'});
        }
    });
}
function facebook_get_music(){
    FB.api(
        '/me/music',
        'get',
        {'limit': 800},
        function (response) {
            if (response && !response.error) {
                console.log(response);
                for(var i=0; i<response.data.length; i++){
                    var artist = response.data[i];
                    add_pref('liked_artists', artist.name);
                }
            }else{
                console.log(response);
                Materialize.toast("Error importing from Facebook", 5000);
            }
        }
    );
}
