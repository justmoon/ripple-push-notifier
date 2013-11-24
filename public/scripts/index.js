$('#auth_btn').click(function (e) {
  window.location.href = '/signup';
});

$('#settings_form').submit(function (e) {
  e.preventDefault();

  var address = $('.field-address').val();

  $.post('/settings/address', {
    address: address
  }, function () {
    alert('submitted');
  });
});
