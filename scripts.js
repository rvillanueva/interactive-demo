'use strict';

function main() {
  var config = {
    eventGapSeconds: 60,
    sensorErrorThreshold: 30
  }

  var parsed = {
    success: 0,
    failed: 0
  }
  var log;
  var customers;
  var cleanedCount = 0;

  loadEvents(function(data){
    init(data)
  });

  function init(input){
    log = parseEventLog(input);
    customers = generateCustomerData(log);
    console.log(customers);
    generateCharts(customers);
    updateDOM();
  }

  function parseEventLog(input){
    var split = input.split('\n');
    var arr = [];
    for (var i = 0; i < split.length; i++){
      var string = split[i] + 'z'; // assuming these times are UTC, because it would be weird for people to be interacting at 2am
      var date = new Date(string);
      if(!isNaN(date)){
        arr.push(date);
        parsed.success++;
      } else {
        parsed.failed++;
      }
    }
    return arr;
  }

  function generateCustomerData(log){
    var customers = splitCustomers(log);
    customers = analyze(customers);
    return customers;

    function splitCustomers(log){
      var customers = [];
      var lastTime;
      for(var i = 0; i < log.length; i++){
        var checked = log[i];
        if(i === 0 || lastTime < (checked - (config.eventGapSeconds * 1000))){
          customers.push({
            events: []
          });
        }
        customers[customers.length - 1].events.push(checked);
        lastTime = checked;
      }
      return customers;
    }

    function analyze(){
      var analyzed = [];
      for(var i = 0; i < customers.length; i++){

        var customer = clearSensorErrors(customers[i]);
        if(customer){
          customer = calculateDuration(customer);
          analyzed.push(customer);
        } else {
          cleanedCount++;
        }

      }
      return analyzed;
    }

    function clearSensorErrors(customer){
      if(customer.events.length <= config.sensorErrorThreshold){
          return customer;
      }
      return false;
    }

    function calculateDuration(customer){
      if(customer.events.length > 1){
        customer.duration = customer.events[customer.events.length - 1] - customer.events[0];
      } else {
        customer.duration = 0;
      }
      return customer;
    }

  }

  function generateCharts(customers){
    //
    generateDailyEngagement();
    generateEngagementTimes();

    function generateEngagementDuration(){
      for(var i = 0; i < customers.length; i++){

      }
    }

    function generateCustomerCount(){

    }
  }


  function updateDOM(){

  }

  function loadEvents(done){
    var client = new XMLHttpRequest();
    client.open('GET', '/events_output.txt');
    client.onreadystatechange = function() {
      if(client.responseText.length > 0){
        done(client.responseText);
      }
    }
    client.send(done);
  }
}

main();
