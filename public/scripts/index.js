$('#settings_form').submit(function (e) {
  e.preventDefault();

  var pushover_key = $('#pushover_key_input').val();

  window.location.href = "/key/" + pushover_key;
});
