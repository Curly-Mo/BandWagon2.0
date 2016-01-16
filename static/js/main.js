"use strict";
window.addEventListener("load", init, false);
function init(){
    if(navigator.userAgent.toLowerCase().indexOf('firefox') > -1 && navigator.appVersion.toLowerCase().indexOf("win") > -1){
        Materialize.toast("This page does not run well in Firefox. Use Chrome for a better experience.", 5000)
    }
    if(navigator.userAgent.toLowerCase().indexOf('msie ') > -1 ||
       navigator.userAgent.toLowerCase().indexOf('trident/') >-1 ||
       navigator.userAgent.toLowerCase().indexOf('edge/') > -1){
        Materialize.toast("This page does not run well in Internet Exporer. Use Chrome or Safari for a better experience.", 5000)
    }

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
    refresh_playlist();
    init_volume();
    init_audio();
    init_progress();
    init_track_actions();
    document.addEventListener('keydown', keydown, false)
    $('#show-playlist').on('tap click', function(){
        active_pane($('#playlist-pane'));
    });

    $('.modal-trigger').leanModal();
}

var audioCtx;
var audio;
var audio_source;
var gain_node;
var events = {};
var artists = {};
var tracks = {};
var promises = [];
var coords;
var settings = {
    'autoplay': true,
    'geolocation': false,
    'startdate': 0,
    'enddate': moment().local().startOf('day').add(1, 'months').diff(moment().local().startOf('day'), 'days'),
    'distance': '20mi',
}

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
}

function play(){
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
    var e = $('#play');
    if(e.html() == 'play_arrow'){
        if(!document.querySelector('.playlist-item.active')){
            $('.playlist-item').first().trigger('click');
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
    function updateProgress() {
        var value = 0;
        if (audio.currentTime > 0) {
            value = (100 / audio.duration) * audio.currentTime;
        }
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

function get_events(){
    var base_url = '//api.seatgeek.com/2/events?';
    var daterange = $('#daterange').val().split(' to ');
    var params = {
        aid: 11799,
        client_id: 'NDA0ODEwNnwxNDUxNTIwNTY1',
        geoip: true,
        range: window.settings.distance || "20mi",
        'taxonomies.name': 'concert',
        'datetime_local.gte': moment().local().startOf('day').add(window.settings.startdate, 'days').format('YYYY-MM-DD'),
        'datetime_local.lte': moment().local().startOf('day').add(window.settings.enddate + 1, 'days').format('YYYY-MM-DD'),
        per_page: 500,
    }
    if(window.coordinates){
        params['lat'] = window.coordinates.latitude;
        params['lon'] = window.coordinates.longitude;
    }else{
        params['geoip'] = true;
    }
    var url = base_url + $.param(params);
    //console.log(url)
    if(!$('#loader').is(':visible')){
        $('#loader').openModal({
            opacity: 0.8,
            dismissible: true,
        });
    }
    $('#loading-message').text('Finding concerts...').fadeIn(200);;
    $.ajax({
        url: url,
        tryCount : 0,
        retryLimit : 1,
        timeout: 20000,
        complete: function(){
            //$('#loader').closeModal();
        },
        success: function(response){
            if(response.events.length > 0) {
                //$('#loader').closeModal({out_duration: 0});
                parse_events(response.events);
            }else{
                this.tryCount++;
                if(this.tryCount <= 10){
                    if(this.tryCount <= 1){
                        $('#loading-message').clearQueue().stop().fadeTo(500, 0.1, function() {
                            $(this).text('Increasing search radius...');
                        }).fadeTo(500, 1);
                    }
                    params.range = parseFloat(params.range.slice(0,-2)) + 1 + 'mi';
                    //params['datetime_local.lte'] = moment(params['datetime_local.lte']).add(1, 'days').format('YYYY-MM-DD'),
                    this.url = base_url + $.param(params);
                    console.log(url);
                    console.log(response);
                    $.ajax(this);
                }else{
                    $('#loader').html("<img style='width:300px;' src='/images/dino.gif'></img><br>"
                        +   "No concerts found in: " + response.meta.geolocation.display_name +"<br>"
                        +   "Is this not where you are? Try enabling improved location accuracy in <i class='mdi-navigation-menu'></i>Settings."
                    );
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
            }else{
                $('#loader').html("<img style='width:300px;' src='/images/dino.gif'></img><br>"
                    +   "We dun goofed!<br>Sorry, my servers are down right now. Please try again later."
                );
            }
        },
    });
}

function shuffle(o){
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
}

function parse_events(events){
    var max_events = 50;
    events = shuffle(events);
    events = apply_event_preferences(events);
    for(var i = 0; i < Math.min(events.length, max_events); i++) {
        (function (i) {
            var event = events[i];
            window.events[event.id] = event;
            for(var j = 0; j < event.performers.length; j++) {
                (function (j) {
                    var performer = event.performers[j];
                    window.artists[performer.id] = performer
                    promises.push(
                        $.ajax({
                            url: soundcloud_url(performer.name, 3),
                            beforeSend: function() {
                                if(!$('#loader').is(':visible')){
                                    $('#loader').openModal({
                                        in_duration: 0,
                                        opacity: 0.8,
                                        dismissible: false,
                                    });
                                }
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
        $('#loader').closeModal();
        load_tracks(create_track_list());
        promises.length = 0;
    }, function(e) {
        // error occurred
        console.log(e);
        $('#loader').closeModal();
        // Try to load anyway
        load_tracks(create_track_list());
        promises.length = 0;
    });
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
    var query_string = $.param(params);
    var url = base_url + '?' + query_string;
    return url
}

function stream_url(track_id){
    var base_url = tracks[track_id].stream_url;
    var params = {
        'client_id': 'f1686e09dcc2a404eccb6f8473803687',
    }
    var query_string = $.param(params);
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
    for(var i = 0; i < Math.min(track_list.length, track_limit); i++) {
        var track = track_list[i];
        $('#playlist').append(
            $('<li>').attr({'class': 'collection-item dismissable avatar playlist-item', 'data-id': track.id})
                .append($('<img>').attr({'class': 'image', 'src': track.image}))
                .append($('<span>').attr('class', 'title').html(window.artists[track.artist_id].name))
                .append($('<p>').html(track.title))
                .append($('<a>').addClass('secondary-content waves-effect waves-light btn').append($('<i>').addClass('material-icons').text('info_outline')))
        );
    }
    $('.playlist-item').on('tap click', function(e){
        // Need to check correct target since Hammer doesn't prevent bubbling with onTap
        if(e.gesture && $(e.gesture.target).closest('.secondary-content')){
            return
        }
        play_item.call(this);
    });
    $('.playlist-item .secondary-content').on('tap click', function(e) {
        set_event_info(window.tracks[$(e.target).parents('[data-id]').attr('data-id')].event_id);
        if(window.matchMedia('(max-width: 600px)').matches){
            active_pane($('#event-pane'));
        }
        return false;
    });
    if(track_limit < track_list.length){
        var more = $('<a>').attr({'class': 'collection-item center', href: ''}).text('Load more');
        $('#playlist').append(more);
        more.on('tap click', function(e){
            e.preventDefault();
            $(this).off();
            load_tracks(track_list.slice(track_limit));
            more.slideUp('medium');
        });
    }
    if(!isMobile() && document.querySelector('#autoplay').checked && audio.paused){
        $('.playlist-item').first().trigger('click');
    }
    init_dismissables();
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
    audio.src = stream_url(track_id)
    play();
    document.querySelector('#waveform').setAttribute('src', tracks[track_id].waveform_url);
    var track = tracks[track_id];
    $('#now-playing').clearQueue().stop().fadeTo(900, 0.05, function() {
        $('#now-playing > img').attr("src", track.image);
        $('#now-playing-artist').text(window.artists[track.artist_id].name);
        $('#now-playing-title').text(track.title);
    }).fadeTo(1000,1);
    set_event_info(track.event_id);
    try{
        ga('send', 'event', 'audio', 'play', {
            eventLabel: window.artists[track.artist_id].name,
            eventValue: track.title,
        });
    }catch(e){
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

function refresh_playlist() {
    $('#playlist').empty();
    if(window.settings.geolocation && 'geolocation' in navigator && !window.coordinates){
        $('#loader').openModal({
            opacity: 0.8,
            dismissible: false,
        });
        $('#loading-message').text('Determining your location...').fadeIn(200);;
        var success = function(position) {
            window.coordinates = position.coords;
            console.log(window.coordinates);
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

function init_dismissables(){
    var swipeLeft = false;
    var swipeRight = false;
    $('.dismissable').each(function() {
        $(this).hammer({
            prevent_default: false
        }).bind('pan', function(e) {
            if (e.gesture.pointerType === "touch") {
                var $this = $(this);
                var direction = e.gesture.direction;
                var x = e.gesture.deltaX;
                var velocityX = e.gesture.velocityX;

                $this.velocity({ translateX: x
                    }, {duration: 50, queue: false, easing: 'easeOutQuad'});
                // Swipe Left
                if (direction === 4 && (x > ($this.innerWidth() / 2) || velocityX < -0.75)) {
                    swipeLeft = true;
                }
                // Swipe Right
                if (direction === 2 && (x < (-1 * $this.innerWidth() / 2) || velocityX > 0.75)) {
                    swipeRight = true;
                }
            }
      }).bind('panend', function(e) {
        // Reset if collection is moved back into original position
        if (Math.abs(e.gesture.deltaX) < ($(this).innerWidth() / 2)) {
            swipeRight = false;
            swipeLeft = false;
        }
        if (e.gesture.pointerType === "touch") {
            var $this = $(this);
            if (swipeLeft || swipeRight) {
                var fullWidth;
                if (swipeLeft) { fullWidth = $this.innerWidth(); }
                else { fullWidth = -1 * $this.innerWidth(); }
                $this.velocity({ translateX: fullWidth,
                    }, {duration: 100, queue: false, easing: 'easeOutQuad', complete:
                    function() {
                        $this.css('border', 'none');
                        $this.velocity({ height: 0, padding: 0,
                            }, {duration: 200, queue: false, easing: 'easeOutQuad', complete:
                            function() { $this.remove(); }
                        });
                    }
                });
            }
            else {
                $this.velocity({ translateX: 0,
                }, {duration: 100, queue: false, easing: 'easeOutQuad'});
            }
            swipeLeft = false;
            swipeRight = false;
        }
    });
    });
}

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
    var datepicker = $('#daterange').dateRangePicker({
        separator : ' to ',
        format: 'YYYY-MM-DD',
        autoClose: true,
        container:'main',
        showTopbar: false,
        startDate: moment().local().format(),
        setValue: function(s){
            if(!$(this).is(':disabled') && s != $(this).val()){
                $(this).val(s);
            }
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
                console.log(window.coordinates);
            }, null, {maximumAge:60*60*1000, timeout:8000, enableHighAccuracy: false});
        }
    });

    $('.drag-target').on('click touchstart', update_settings);
    $('body').on('click touchstart', '#sidenav-overlay', update_settings);
    load_settings();
    $('#show-likes, #show-dislikes').on('click', function(){
        load_preferences();
    });
    $('#add_liked_artist, #add_liked_genre, #add_disliked_artist, #add_disliked_genre').on('keydown', add_pref);
}

function load_settings(){
    var new_settings = localStorage.getItem('settings');
    if(new_settings){
        window.settings = JSON.parse(new_settings);
    }
    $('#daterange').data('dateRangePicker').setDateRange(
        moment().local().startOf('day').add(window.settings.startdate, 'days').format(),
        moment().local().startOf('day').add(window.settings.enddate, 'days').format()
    );
    document.querySelector('#distance').noUiSlider.set(window.settings.distance);
    document.querySelector('#autoplay').checked = window.settings.autoplay;
    document.querySelector('#geolocation').checked = window.settings.geolocation;
}

function update_settings(){
    var daterange = $('#daterange').val().split(' to ');
    var new_settings = {
        'autoplay': document.querySelector('#autoplay').checked,
        'geolocation': document.querySelector('#geolocation').checked,
        'startdate': moment(daterange[0]).local().startOf('day').diff(moment().local().startOf('day'), 'days'),
        'enddate': moment(daterange[1]).local().startOf('day').diff(moment().local().startOf('day'), 'days'),
        'distance': document.querySelector('#distance').noUiSlider.get(),
    }
    if(JSON.stringify(window.settings) !== JSON.stringify(new_settings)){
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

function set_event_info(event_id){
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
    maps_url = maps_url + $.param(params);
    $('#event-venue').clearQueue().stop().fadeTo('medium', 0.1, function() {
        $(this).html('@ ');
        $(this).append($('<a>').text(event.venue.name).attr({'href': maps_url, 'target': '_blank'}));
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
         $(this).text('Lineup:');
    }).fadeTo('medium', 1);
    // Artists
    $('#event-artists').clearQueue().stop().fadeTo('medium', 0.1, function() {
        $(this).empty();
        for(var i=0;i<event.performers.length;i++){
            var artist = event.performers[i];
            var el = $('<li>').addClass('artist-item').attr('data-artist-id', artist.id)
                    .append($('<div>').addClass('collapsible-header').text(artist.name))
                    .append($('<div>').addClass('collapsible-body'))
            $(this).append(el);
            if($('.playlist-item.active').length && artist.id == tracks[$('.playlist-item.active').attr('data-id')].artist_id){
                el.children().first().addClass('active');
            }
            echonest_artist_info(artist.id);
        }
        $(this).collapsible();
    }).fadeTo('medium', 1);
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
    if(window.matchMedia('(max-width: 600px)').matches){
        $('.pane').not(pane).animate({width:'hide'}, 350);
    }
    if(pane.attr('id') != 'playlist-pane'){
        $('#show-playlist').fadeTo('slow', 1);
    }
    pane.animate({width:'show'}, 350);
    if(pane.attr('id') == 'playlist-pane'){
       $('#show-playlist').fadeTo('slow', 0);
    }
}

function play_artist(artist_id, event_id){
    var artist = artists[artist_id];
    $.ajax({
        url: soundcloud_url(artist.name, 15),
        success: function(response){
            $('#playlist').empty();
            window.tracks = {};
            parse_tracks(response, event_id, artist_id);
            load_tracks(create_track_list());
        }
    })
}

function init_track_actions(){
    $('body').on('click', '#thumb_up', function(){
        var track_id = $(this).parent().prev().attr('data-id');
        var track = tracks[track_id];
        var liked_artists = JSON.parse(localStorage.getItem('liked_artists')) || {};
        var liked_genres = JSON.parse(localStorage.getItem('liked_genres')) || {};
        var name = artists[track.artist_id].name;
        if(!(name.toLowerCase in liked_artists)){
            liked_artists[name.toLowerCase()] = name;
            localStorage.setItem('liked_artists', JSON.stringify(liked_artists));
            var action = "delete_pref('liked_artists', '" + name.toLowerCase()+"');" + 'this.parentNode.remove()';
            console.log(action);
            Materialize.toast('Liked artist: ' + name + ' <a class="btn waves-effect waves-light" onclick="'+action+'">undo</a>', 4000, 'action-toast');
        }
        if(track.genre && !(track.genre in liked_genres)){
            liked_genres[track.genre.toLowerCase()] = track.genre;
            localStorage.setItem('liked_genres', JSON.stringify(liked_genres));
            var action = "delete_pref('liked_genres', '" + track.genre.toLowerCase()+"');" + 'this.parentNode.remove()';
            Materialize.toast('Liked genre: ' + track.genre + ' <a class="btn waves-effect waves-light" onclick="'+action+'">undo</a>', 4000, 'action-toast');
        }
        $(this).parent().slideUp(400);
    });
    $('body').on('click', '#thumb_down', function(){
        var track_id = $(this).parent().prev().attr('data-id');
        var track = tracks[track_id];
        var disliked_artists = JSON.parse(localStorage.getItem('disliked_artists')) || {};
        var disliked_genres = JSON.parse(localStorage.getItem('disliked_genres')) || {};
        var name = artists[track.artist_id].name;
        if(!(name.toLowerCase() in disliked_artists)){
            disliked_artists[name.toLowerCase()] = name;
            localStorage.setItem('disliked_artists', JSON.stringify(disliked_artists));
            var action = "delete_pref('disliked_artists', '" + name.toLowerCase()+"');" + 'this.parentNode.remove()';
            Materialize.toast('Disliked artist: ' + name + ' <a class="btn waves-effect waves-light" onclick="'+action+'">undo</a>', 4000, 'action-toast');
        }
        if(track.genre && !(track.genre.toLowerCase in disliked_genres)){
            disliked_genres[track.genre.toLowerCase()] = track.genre;
            localStorage.setItem('disliked_genres', JSON.stringify(disliked_genres));
            var action = "delete_pref('disliked_genres', '" + track.genre.toLowerCase()+"');" + 'this.parentNode.remove()';
            Materialize.toast('Disliked genre: ' + track.genre + ' <a class="btn waves-effect waves-light" onclick="'+action+'">undo</a>', 4000, 'action-toast');
        }
        $(this).parent().slideUp(400);
    });
}

function show_track_actions(){
    var active = $(this);
    console.log(tracks[active.attr('data-id')].genre);
    var track_actions = $('#track-actions');
    if(track_actions.length == 0){
        track_actions = $('<li>').attr('id', 'track-actions')
            .append($('<a>', {
                    'id': 'thumb_up',
                    'class': 'waves-effect waves-light btn',
                }).append($('<i>', {
                    'class': 'material-icons',
                    'text': 'thumb_up',
                })))
            .append($('<a>', {
                    'id': 'thumb_down',
                    'class': 'waves-effect waves-light btn',
                }).append($('<i>', {
                    'class': 'material-icons',
                    'text': 'thumb_down',
                })));
    }
    var pref_types = [
        'liked_artists',
        'liked_genres',
        'disliked_artists',
        'disliked_genres',
    ];
    var preferences = {};
    for(var i = 0; i < pref_types.length; i++){
        var pref = JSON.parse(localStorage.getItem(pref_types[i])) || {};
        preferences = jQuery.extend(preferences, pref);
    }
    var track = tracks[active.attr('data-id')];
    if(!(track.genre && track.genre.toLowerCase() in preferences || artists[track.artist_id].name.toLowerCase() in preferences)){
        track_actions.insertAfter(active).stop(true, true).slideDown(600);
    }
}

function load_preferences(){
    var preferences = [
        'liked_artists',
        'liked_genres',
        'disliked_artists',
        'disliked_genres',
    ];
    for(var i = 0; i < preferences.length; i++){
        var pref = JSON.parse(localStorage.getItem(preferences[i])) || {};
        var el = $('#'+preferences[i]);
        el.empty();
        var keys = Object.keys(pref).sort();
        for(var k = 0; k < keys.length; k++){
            var close = $('<i>', {
                'class': 'material-icons',
                'text': 'close',
            });
            el.append(
                $('<div>', {
                    'class': 'chip',
                    'text': pref[keys[k]],
                }).append(close)
            );
            close.on('click', remove_pref);
        }
    }
}

function remove_pref(){
    var pref = this.parentNode.childNodes[0].nodeValue;
    var pref_type = $(this).parent().parent().attr('id');
    var preferences = JSON.parse(localStorage.getItem(pref_type)) || {};
    delete preferences[pref.toLowerCase()]
    localStorage.setItem(pref_type, JSON.stringify(preferences));
}

function add_pref(event){
    if (event.keyCode == 13) {
        var pref_type = this.parentNode.previousElementSibling.id;
        var preferences = JSON.parse(localStorage.getItem(pref_type)) || {};
        if(this.value != ''){
            preferences[this.value.toLowerCase()] = this.value;
            localStorage.setItem(pref_type, JSON.stringify(preferences));
            load_preferences();
            this.value = '';
        }
    }
}

function delete_pref(pref_type, pref){
    var preferences = JSON.parse(localStorage.getItem(pref_type)) || {};
    delete preferences[pref.toLowerCase()]
    localStorage.setItem(pref_type, JSON.stringify(preferences));
    console.log(this);
}

function apply_event_preferences(events){
    var liked_artists = JSON.parse(localStorage.getItem('liked_artists')) || {};
    var disliked_artists = JSON.parse(localStorage.getItem('disliked_artists')) || {};
    if(Object.keys(liked_artists).length > 0 || Object.keys(disliked_artists).length > 0){
        for(var i = 0; i < events.length; i++){
            var event = events[i];
            var performers = jQuery.map(event.performers, function(performer) { return performer.name; });
            // Move liked artist events to the front of the list
            if(performers.some(function(v) { return v.toLowerCase() in liked_artists; })){
                events.splice(i, 1);
                events.unshift(event);
                console.log('Moving to front:');
                console.log(event);
            // Remove disliked artist events
            }else if(performers.some(function(v) { return v.toLowerCase() in disliked_artists; })){
                events.splice(i, 1);
                i--;
                console.log('Removing event:');
                console.log(event);
            }
        }
    }
    return events;
}

function apply_track_preferences(tracks){
    var liked_artists = JSON.parse(localStorage.getItem('liked_artists')) || {};
    var liked_genres = JSON.parse(localStorage.getItem('liked_genres')) || {};
    var disliked_genres = JSON.parse(localStorage.getItem('disliked_genres')) || {};
    if(Object.keys(liked_artists).length > 0 || Object.keys(liked_genres).length > 0 || Object.keys(disliked_genres).length > 0){
        for(var i = 0; i < tracks.length; i++){
            var track = tracks[i];
            // Move liked artists close to the top of playlist
            if(artists[track.artist_id].name.toLowerCase() in liked_artists){
                tracks.splice(i, 1);
                tracks.splice(rand_int(0, 8), 0, track); 
                delete liked_artists[artists[track.artist_id].name.toLowerCase()];
                console.log('Prioritizing track:');
                console.log(track);
            // Move liked genres close to the top of playlist
            }else if(track.genre && track.genre.toLowerCase() in liked_genres){
                tracks.splice(i, 1);
                tracks.splice(rand_int(0, 8), 0, track); 
                delete liked_genres[track.genre.toLowerCase()];
                console.log('Prioritizing track:');
                console.log(track);
            // Remove tracks of disliked genres
            }else if(track.genre && track.genre.toLowerCase() in disliked_genres){
                tracks.splice(i, 1);
                i--;
                console.log('Removing track:');
                console.log(track);
            }
        }
    }
    return tracks;
}

function rand_int(min, max){
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
