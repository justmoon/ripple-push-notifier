$('#create_form').submit(function (e) {
  e.preventDefault();

  var ripple_address = $('#ripple_address_input').val();
  var pushover_key = $('#pushover_key_input').val();

  $.post('/subscriptions/pushover/create', {
    ripple_address: ripple_address,
    pushover_key: pushover_key
  }, function () {
    window.location.reload();
  });
});

$('a.unsubscribe').click(function (e) {
  e.preventDefault();

  var ripple_address = $(this).data('ripple-address');
  var pushover_key = $('#pushover_key_input').val();

  $.post('/subscriptions/pushover/delete', {
    ripple_address: ripple_address,
    pushover_key: pushover_key
  }, function () {
    window.location.reload();
  });
});
