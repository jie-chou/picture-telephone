$sectionAppSplash = $('#splash');
$sectionAppLogin = $('#login');
$sectionGameSelection = $('#game_selection');
$sectionGameLobby = $('#game_lobby');
$sectionGamePhrase = $('#game_phrase');
$sectionGameDraw = $('#game_draw');
$sectionGameGuess = $('#game_guess');
$sectionGameGuessSubmitted = $('#game_guess_submitted');
$sectionFinished = $('#game_finished');

$finishedContent = $("#game_finished_content");

MINIMUM_REQUIRED_PLAYERS = 2;
TIMER_SECONDS = 90;

$('input').attr('autocomplete','off');

function showSection(section){
  $("section").hide();
  $(".wait").hide();
  section.show();
}

// SPLASH
$splash_login = $('#splash_login');
$splash_signup = $('#splash_signup');
// LOGIN
$btnLogin = $('#btnLogin');
$users = $('#users');
$username = $('#username');
// GAME SELECTION
$gameHost = $('#game_host');
$gameJoin = $('#game_join');
$gameCode = $('#game_code');
$gameJoinCode = $('#join_game_code');
// CHAT
$message = $('#message');
$chat = $('#chat');

$(document).ready(function(){
  $username.val(loadKey("username"));
});

$(function () {
  $splash_login.click(function(){ showSection($sectionAppLogin); });
  var socket = io(); // defaults to the host that serves the page
  /* ==== BEGIN USER LOGIN ==== */
  $btnLogin.click(function(event){
    if ($username.val() == "")
      return false;
    showSection($sectionGameSelection);
    event.preventDefault();
    $("#join_game_code").focus();
    saveKeyValue("username", $username.val());
    return false;
  });
  /* ==== END LOGIN ==== */

  /* ==== BEGIN GAME HOST SETUP ==== */
  $gameHost.click(function(event){
    $("#btnStartGame").show();
    showSection($sectionGameLobby);
    socket.emit('new player', {username: $username.val(), gamecode: ""}, function(data){
      if (data){
        showSection($sectionGameLobby);
      }
    });
    event.preventDefault();
    return false;
  });
  socket.on('get gamecode', function(res){
    $gameCode.html(res);
    $gameJoinCode.val(res);
    saveKeyValue("gamecode", res);
  });
  /* ==== END GAME HOST SETUP ==== */

  /* ==== BEGIN GAME JOIN ==== */
  $gameJoin.click(function(event){
    gameCode = $gameJoinCode.val().toUpperCase();
    if (gameCode != "")
    {
      showSection($sectionGameLobby);
      socket.emit('new player', {username: $username.val(), gamecode: gameCode}, function(success)  {
        if (success){
          showSection($sectionGameLobby);
        }
      });
    }
    event.preventDefault();
    return false;
  });
  /* ==== END GAME JOIN ==== */

  $('#btnStartGame').click(function(){
    if ($("#player_count").attr("count") >= MINIMUM_REQUIRED_PLAYERS)
      socket.emit('start game', {username: $username.val(), gamecode: $gameJoinCode.val()}); // send to server
  });

  $(".instructions_close").on("click", function(){
    $(".instructions").hide();
    $("#canvas-wrapper").show();
  });

  $(".game_submit").on("click", function(){
    type = $(this).attr("type");
    submitTurn(type);
  });

  function submitTurn(type){
    payload = "";
    console.log(type);
    $("#game_wait_" + type).show();
    $("#canvas-wrapper").hide();
    $("section").hide();
    clearInterval(counter);

    switch(type) {
      case "phrase":
        payload = $("#phrase").val();
        $("#phrase").val("");
        break;
      case "guess":
        payload = $("#guess").val();
        $("#guess").val("");
        break;
      case "drawing":
        payload = saveDrawing();
        break;
      default:
        return;
    }

    socket.emit('submit ' + type, {username: $username.val(), gamecode: $gameJoinCode.val(), type: type, payload: payload});
  }

  $('.new_game').click(function(){
    $('#game_finished_content').html("");
    showSection($sectionGameSelection);
  });

  /* ==== BEGIN CHAT ==== */
  // send message
  $('#btnSendMsg').click(function(){
    socket.emit('send message', $message.val()); // send to server
    $message.val(''); // clear message
    return false;
  });

  // received message
  socket.on('receive message', function(res){
    $chat.append("<div><strong>" + res.username + "</strong>: " + res.msg + "</div>");
  });
  /* ==== END CHAT ==== */

  socket.on('start game', function(res){
    $("#game_phrase_instructions").show();
    showSection($sectionGamePhrase);
  });

  var count = TIMER_SECONDS;
  var counter;
  function timer()
  {
    console.log(count);
    count=count-1;
    if (count <= 0)
    {
      clearInterval(counter);
      submitTurn("drawing");
      return;
    }
    $("#timer").html(count);
  }

  socket.on('submit phrase everyone ready', function(res){
    count = TIMER_SECONDS;
    counter = setInterval(timer, 1000);

    username = $username.val();
    $("#banner-draw-from").html(res[username].user);
    $("#banner-draw-phrase").html(res[username].data);
    $("#phrase").val("");
    console.log("everyone is ready");
    $("#game_draw_instructions").show();
    showSection($sectionGameDraw);
    $(".ready_list").html("These folks are ready:");
  });

  socket.on('submit drawing everyone ready', function(res){
    console.log("start");
    $("#svg").html(res[username].data);
    $("#svg svg").attr("width", "100%");
    $("#svg svg").attr("height", "100%");
    console.log(res[username].data);
    clearCanvas();
    $("#game_guess_instructions").show();
    showSection($sectionGameGuess);
    $(".ready_list").html("These folks are ready:");
    clearInterval(counter);
  });

  $("#instructions_close_guess").on("click", function(){
    animateDrawing();
  });

  $("#game_guess_replay").on("click", animateDrawing);

  socket.on('submit guess everyone ready', function(res){
    count = TIMER_SECONDS;
    counter = setInterval(timer, 1000);
    $("#banner-draw-from").html(res[username].user);
    $("#banner-draw-phrase").html(res[username].data);
    $("#guess").val("");
    $(".ready_list").html("These folks are ready:");
    $("#game_draw_instructions").show();
    showSection($sectionGameDraw);
  });

  socket.on('user ready', function(res){
    $(".ready_list").append("<div>"+res+"</div>");
  });
  finishedJson = undefined;
  results_shift = 0;
  socket.on('finished', function(res){
    results_shift = 0;
    showSection($sectionFinished);
    finishedJson = res;
    showFinishedResults(finishedJson, 0);
  });
  $("#game_finished_next").on("click", function(){showFinishedResults(finishedJson, ++results_shift)});
  $("#game_finished_previous").on("click", function(){showFinishedResults(finishedJson, --results_shift)});

  function showFinishedResults(finishedJson, shift){
    $finishedContent.html("");
    console.log(finishedJson);
    console.log(shift);

    if (finishedJson != undefined){
      finishedJson.forEach(function(paper_trail_results, index)
      {
        n = finishedJson.length;
        offset_index = ((index + shift) % (n) + n) % n;

        if (finishedJson[offset_index][0].source_user == username)
        // if (finishedJson[offset_index][0].source_user != "<<<DO NOT SHOW USER PHRASE FIRST!>>>")
        {
          console.log(paper_trail_results);
          // found the results for this user
          for (turn_index = 1; turn_index < paper_trail_results.length; turn_index++)
          {
            type = paper_trail_results[turn_index].type;
            console.log(type);
            data = paper_trail_results[turn_index].data;
            console.log(data);
            user = paper_trail_results[turn_index].user;
            console.log(user);
            if (type == "phrase" || type == "guess")
              $finishedContent.append('<div class="results_turn"><div class="results_turn_user">' + user + ':</div> ' + data+ '</div>');
            else if (type == "drawing")
              $finishedContent.append('<div class="results_turn"><div class="results_turn_user">' + user + ':</div><div class="svg-wrapper">' + data+ '</div></div>');
            $("svg").attr("width", "100%");
            $("svg").attr("height", "100%");
          }
        }
      });
    }
  }

  /* ==== BEGIN PLAYER STATUS ==== */
  socket.on('get users', function(res){
    var html = '';
    for (i = 0; i < res.length; i++)
      html += '<div>' + res[i] + '</div>';
    $users.html(html);
    $("#player_count").attr("count", res.length);
    if (res.length == 1)
      $("#player_count").html(res.length + " Player");
    else
      $("#player_count").html(res.length + " Players");
  });
  // player events
  socket.on('player status', function(res){
    console.log(res.msg);
  });
  /* ==== BEGIN PLAYER STATUS ==== */


  var canvas = document.getElementById('canvas');
  var context = canvas.getContext('2d');

  window.addEventListener('resize', resizeCanvas, false);

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerWidth;
    $(".banner").height(window.innerWidth / 331 * 71);
    $("#game_code").height(window.innerWidth * .5 / 152 * 20);
  }
  resizeCanvas();

  var $canvas = this.__canvas = new fabric.Canvas('canvas', {
    isDrawingMode: true,
  });

  fabric.Object.prototype.transparentCorners = false;

  var $canvasColorSelector = $('#drawing-color'),
    $canvasSelectWidth = $('#drawing-line-width'),
    $btnErase = $('#erase');
    $btnClearCanvas = $('#clear-canvas');
    
    
    data = '';

  function saveDrawing() {
    data = $canvas.toSVG();
    console.log(data);
    return data;
  }

  function loadDrawing(){ 
    fabric.loadSVGFromString(data, function(objects, options) {
      var obj = fabric.util.groupSVGElements(objects, options);
      $canvas.add(obj).renderAll();
    });
  }

  function animateDrawing(){
    drawDuration = 5000;
    drawPathCount = $('#svg svg path').length || 1;
    drawDurationPath = drawDuration / drawPathCount;

    var mySVG = $('#svg svg').drawsvg();
    mySVG.drawsvg({
      duration: drawDurationPath,
      stagger: drawDurationPath,
      easing: 'linear',
    });
    mySVG.drawsvg('animate');
  }

  function clearCanvas(){
    $canvas.clear();
  }

  // ============= DRAWING MODES =============
  $btnClearCanvas.on("click", clearCanvas);

  $btnErase.on("click", function() {
    $canvas.freeDrawingBrush.color = "#fff";
    $(".drawing-color-selector").children().attr("src","/images/btn-color.png");
    $btnErase.attr("src", "/images/erase-selected.png");
    $(".drawing-width-selector").css("background-color", "#fff");
  });

  $(".drawing-color-selector").on("click", function(){
    $canvas.freeDrawingBrush.color = $(this).css("background-color");
    $(".drawing-color-selector").children().attr("src","/images/btn-color.png");
    $(this).children().attr("src","/images/btn-color-selected.png");
    $btnErase.attr("src", "/images/erase.png");
    $(".drawing-width-selector").css("background-color", $(this).css("background-color"));
  });

  $(".drawing-width-selector").on("click",function(){
    $canvas.freeDrawingBrush.width = parseInt($(this).attr("value"));
    $(".drawing-width-selector").each(function(){
      $(this).children("img").attr("src", $(this).children("img").attr("src").replace("-selected",""));
    });
    $(this).children("img").attr("src", $(this).children("img").attr("src").replace(".","-selected."));
  });

  if ($canvas.freeDrawingBrush) {
    $canvas.freeDrawingBrush.color = "#000";
    $canvas.freeDrawingBrush.width = 5;
  }

});

$(document).dblclick(function(){
    return false;
});

function saveKeyValue(key, value)
{
  localStorage.setItem(key, value);
}
function loadKey(key)
{
  return localStorage.getItem(key);
}

