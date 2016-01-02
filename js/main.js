"use strict";
window.addEventListener("load", init, false);
function init(){
    // Initialize collapse button
    $('.button-collapse').sideNav({
        menuWidth: 300, // Default is 240
        edge: 'left', // Choose the horizontal origin
        closeOnClick: true // Closes side-nav on <a> clicks, useful for Angular/Meteor
    });

    var slider = document.getElementById('volume-slider');
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
    var volume_button = document.getElementById('volume-button');
    volume_button.addEventListener("mouseover", show_volume, false);
    volume_button.addEventListener("touchstart", show_volume, false);
    function show_volume(){
        $('#volume-container').show();
    }
    var volume_container = document.getElementById('volume-container');
    volume_container.addEventListener("mouseleave", hide_volume, false);
    volume_container.addEventListener("onfocusout", hide_volume, false);
    function hide_volume(){
        $('#volume-container').hide();
    }
    $('#play-button').on('tap click', play_toggle);
    $('#loader').hide();
    get_events();
    init_audio();

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

function init_audio(){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio_source = audioCtx.createMediaElementSource(audio);
    gain_node = audioCtx.createGain();
    audio_source.connect(gain_node);
    gain_node.connect(audioCtx.destination);

    var volume = document.querySelector('#volume-slider');
    gain_node.gain.value = volume.noUiSlider.get();
    volume.noUiSlider.on('update', function(){
        gain_node.gain.value = volume.noUiSlider.get();
    });
}

function play(){
    audio_source.mediaElement.play();
    var e = $('#play');
    if(e.html() == 'play_arrow'){
        e.fadeOut('fast', function() {
            e.html('pause');
            e.fadeIn('fast');
        });
    }
}

function pause(){
    audio_source.mediaElement.pause();
    var e = $('#play');
    if(e.html() == 'pause'){
        e.fadeOut('fast', function() {
            e.html('play');
            e.fadeIn('fast');
        });
    }
}

function play_toggle(){
    var e = $('#play');
    if(e.html() == 'play_arrow'){
        audio_source.mediaElement.play();
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
    var curr = document.querySelector('.active')
    var next = curr.nextElementSibling;
    next.click();
}

function prev(){
    var curr = document.querySelector('.active')
    var prev = curr.previousElementSibling;
    prev.click();
}

function get_events(){
    var base_url = 'http://api.seatgeek.com/2/events?';
    var params = {
        geoip: true,
        aid: 11799,
        client_id: 'NDA0ODEwNnwxNDUxNTIwNTY1',
        range: '20mi',
        per_page: 20,
        'taxonomies.name': 'concert',
    }
    var query_string = $.param(params);
    console.log(query_string);
    var url = base_url + query_string;
    $.ajax({
        url: url,
        context: document.body,
        beforeSend: function() {
            $('#loader').show();
        },
        complete: function(){
            //$('#loader').hide();
        },
        success: function(response){
            parse_events(response.events);
            $('#loader').hide();
        }
    });
}

function parse_events(events){
    for(var i = 0; i < events.length; i++) {
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
        $('#loader').hide();
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
        'limit': 5,
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
    $('.playlist-item').first().trigger('click');
    Materialize.showStaggeredList('#playlist')
}

function create_track_list(){
    var arr = Object.keys(window.tracks).map(function (key) {return window.tracks[key]});
    return arr;
}

function play_item(){
    if(this.classList.contains('active')){
        return;
    }
    document.querySelector('.active').classList.remove('active');
    play_track(this.getAttribute('data-id'));
    this.classList.add('active');
}

function play_track(track_id){
    audio.src = stream_url(track_id)
    play();
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
