"use strict";
window.addEventListener("load", init, false);
function init(){
    // Initialize collapse button
    $('.button-collapse').sideNav({
        menuWidth: 300, // Default is 240
        edge: 'left', // Choose the horizontal origin
        closeOnClick: true // Closes side-nav on <a> clicks, useful for Angular/Meteor
    });

    $('#play-button').on('tap click', play_toggle);
    $('#prev-button').on('tap click', prev);
    $('#next-button').on('tap click', next);
    init_settings();
    get_events();
    init_volume();
    init_audio();
    init_progress();

    document.addEventListener('keydown', keydown, false)
}

var audioCtx;
var audio;
var audio_source;
var gain_node;
var events = {};
var artists = {};
var tracks = {};
var promises = [];
var settings = {
    'startdate': moment().local().format('YYYY-MM-DD'),
    'enddate': moment().local().add(1, 'months').format('YYYY-MM-DD'),
    'distance': '20mi',
}

function init_audio(){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio_source = audioCtx.createMediaElementSource(audio);
    gain_node = audioCtx.createGain();
    audio_source.connect(gain_node);
    gain_node.connect(audioCtx.destination);

    var volume = document.querySelector('#volume-slider');
    gain_node.gain.value = volume.noUiSlider.get()/100.0;
    volume.noUiSlider.on('update', function(){
        gain_node.gain.value = volume.noUiSlider.get()/100.0;
    });
    audio.addEventListener('ended', next);
}

function play(){
    audio_source.mediaElement.play();
    var e = $('#play');
    if(e.html() == 'play_arrow'){
        e.fadeTo('fast', 0.1, function() {
            e.html('pause');
        }).fadeTo('fast', 1);
    }
}

function pause(){
    audio_source.mediaElement.pause();
    var e = $('#play');
    if(e.html() == 'pause'){
        e.fadeTo('fast', 0.1, function() {
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
            audio_source.mediaElement.play();
        }
        e.fadeOut('fast', function() {
            e.html('pause');
            e.fadeIn('fast');
        });
    }else{
        audio_source.mediaElement.pause();
        e.fadeOut('fast', function() {
            e.html('play_arrow');
            e.fadeIn('fast');
        });
    }
}

function next(){
    var curr = document.querySelector('.playlist-item.active')
    if(!curr){
        $('.playlist-item').first().trigger('click');
    }else{
        var next = curr.nextElementSibling;
        next.click();
    }
}

function prev(){
    var curr = document.querySelector('.playlist-item.active')
    var prev = curr.previousElementSibling;
    prev.click();
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
    }
    slider.noUiSlider.on('slide', set_progress);
    function set_progress(value){
        audio.currentTime = value / (100 / audio.duration); 
    }
    var progress_container= document.querySelector('#progress-container');
    progress_container.addEventListener('mouseover', showWaveform, false);
    progress_container.addEventListener('mouseleave', hideWaveform, false);
    var timeout;
    function showWaveform(){
        timeout = setTimeout(function() {
            $('#waveform').fadeIn(100);
            $('#progress').animate({ height: '80px' }, 'easeInOutCubic');
        }, 0.1 * 1000)
    }
    function hideWaveform(){
        if(timeout) {
            clearTimeout(timeout);
        }
        $('#waveform').fadeOut('fast');
        $('#progress').animate({ height: '4px' }, 'easeInOutCubic');
    }
}

function get_events(){
    var base_url = 'http://api.seatgeek.com/2/events?';
    var daterange = $('#daterange').val().split(' to ');
    var params = {
        aid: 11799,
        client_id: 'NDA0ODEwNnwxNDUxNTIwNTY1',
        geoip: true,
        range: settings.distance || "20mi",
        'taxonomies.name': 'concert',
        'datetime_utc.gte': settings.startdate || moment().local().format(),
        'datetime_utc.lte': settings.enddate || moment().local().add(1, 'months').format(),
        per_page: 1000,
    }
    var query_string = $.param(params);
    var url = base_url + query_string;
    $.ajax({
        url: url,
        tryCount : 0,
        retryLimit : 1,
        timeout: 20000,
        beforeSend: function() {
            $('#loader').show();
            $('#loading-message').text('Finding concerts...').fadeIn(200);;
        },
        complete: function(){
            //$('#loader').hide();
        },
        success: function(response){
            $('#loader').hide();
            parse_events(response.events);
        },
        error: function (response, status, error) {
            this.tryCount++;
            if(this.tryCount <= this.retryLimit){
                $('#loading-message').fadeOut(500, function() {
                    $(this).text('Retrying...').fadeIn(500);
                });
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
                            url: soundcloud_url(performer.name),
                            context: document.body,
                            beforeSend: function() {
                                $('#loader').show();
                                $('#loading-message').fadeOut(500, function() {
                                    $(this).text('Loading tracks...').fadeIn(500);
                                });
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
        $('#loader').fadeOut(300);
        load_tracks();
    }, function() {
        // error occurred
        $('#loader').hide();
    });
}

function soundcloud_url(artist){
    var base_url = 'http://api.soundcloud.com/tracks';
    var params = {
        'client_id': 'f1686e09dcc2a404eccb6f8473803687',
        'order': 'hotness',
        'limit': 3,
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

function load_tracks(){
    var tracks = create_track_list();
    for(var i = 0; i < tracks.length; i++) {
        var track = tracks[i];
        $('#playlist').append(
            $('<li>').attr({'class': 'collection-item dismissable avatar playlist-item', 'data-id': track.id})
                .append($('<img>').attr({'class': 'image', 'src': track.image}))
                .append($('<span>').attr('class', 'title').html(window.artists[track.artist_id].name))
                .append($('<p>').html(track.title))
        );
    }
    $('.playlist-item').on('tap click', play_item);
    if(!isMobile() && audio.paused){
        $('.playlist-item').first().trigger('click');
    }
    init_dismissables();
}

function create_track_list(){
    var arr = Object.keys(window.tracks).map(function (key) {return window.tracks[key]});
    arr = shuffle(arr);
    return arr;
}

function play_item(){
    if(this.classList.contains('active')){
        return;
    }
    $('.playlist-item.active').removeClass('active');
    play_track(this.getAttribute('data-id'));
    this.classList.add('active');
    // Scroll to top
    $(this).parent().parent().stop().animate({
        scrollTop: $(this).offset().top - $(this).parent().offset().top
    }, 1000);
}

function play_track(track_id){
    audio.src = stream_url(track_id)
    play();
    document.querySelector('#waveform').setAttribute('src', tracks[track_id].waveform_url);
    var track = tracks[track_id];
    $('#now-playing').fadeTo(900, 0.05, function() {
        $('#now-playing > img').attr("src", track.image);
        $('#now-playing-artist').text(window.artists[track.artist_id].name);
        $('#now-playing-title').text(track.title);
    }).fadeTo(1000,1);
}

function keydown(e){
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
    get_events();
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
            if(!$(this).is(':disabled') && s != $(this).val())
            {
                $(this).val(s);
            }
        },
    });
    $('#daterange').data('dateRangePicker').setDateRange(moment().local().format(), moment().local().add(1, 'months').format());

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
                return value;
            }
        },
    });
    $('.drag-target').on('click touchstart', update_settings);
}

function update_settings(){
    var daterange = $('#daterange').val().split(' to ');
    var new_settings = {
        'startdate': daterange[0],
        'enddate': daterange[1],
        'distance': document.querySelector('#distance').noUiSlider.get(),
    }
    if(JSON.stringify(window.settings) !== JSON.stringify(new_settings)){
        window.settings = new_settings;
        refresh_playlist();
    }
}
