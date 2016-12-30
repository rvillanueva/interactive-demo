'use strict';

var config = {
  eventGapSeconds: 60,
  sensorErrorThreshold: 30,
  timezoneOffset: -5,
  period: 'day',
  colors: ['#708CF8', '#7AC943']
}

var parsed = {
  success: 0,
  failed: 0
}
var log;
var customers;
var errors = [];
var cleanedCount = 0;
var chart;
var eventOutput;

loadEvents(function(data) {
  eventOutput = data;
  loadTextarea(data);
  processInput();
});


function loadEvents(done) {
  var client = new XMLHttpRequest();
  client.open('GET', '/events_output.txt');
  client.onreadystatechange = function() {
    if (client.readyState == 4 && client.status == 200 && client.responseText) {
      done(client.responseText);
    }
  }
  client.send();
}

function loadTextarea(text) {
  document.getElementById("event-output").value = text;
}

function loadFromTextarea() {
  eventOutput = document.getElementById("event-output").value;
}

function processInput() {
  if(eventOutput){
    log = parseEventLog(eventOutput);
    var uncleaned = splitCustomers(log);
    customers = clearSensorErrors(uncleaned);
    generateCharts(customers);
    updateDOM();
  } else {
    alert('Please copy event output file into the text area before running.')
  }
}

function parseEventLog(input) {
  var split = input.split('\n');
  var arr = [];
  for (var i = 0; i < split.length; i++) {
    var string = split[i] + 'z'; // setting these times are UTC, because it would be weird for people to be interacting at 2am Eastern
    var date = new Date(string);
    if (!isNaN(date)) {
      arr.push(date);
      parsed.success++;
    } else {
      parsed.failed++;
    }
  }
  return arr;
}

function splitCustomers(log) {
  var customers = [];
  var lastTime;
  for (var i = 0; i < log.length; i++) {
    var checked = log[i];
    if (i === 0 || lastTime < (checked - (config.eventGapSeconds * 1000))) {
      customers.push({
        events: []
      });
    }
    customers[customers.length - 1].events.push(checked);
    lastTime = checked;
  }
  return customers;
}

function clearSensorErrors(customers) {
  var cleaned = [];
  for (var i = 0; i < customers.length; i++) {
    var customer = customers[i];
    if (customer.events.length <= 30) {
      cleaned.push(customer);
    } else {
      errors.push(customer)
    }
  }
  return cleaned;
}


function generateCharts(customers) {
  var buckets = [];
  var chartData = {
    labels: [],
    datasets: [{
      label: 'Customer Count',
      backgroundColor: config.colors[0],
      yAxisID: 'A',
      data: []
    }, {
      label: 'Average Engagement Duration (minutes)',
      backgroundColor: config.colors[1],
      yAxisID: 'B',
      data: []
    }]
  }

  generateTimeBuckets();
  attachCustomerData();
  populateChartData();
  console.log('building chart...')
  buildChart();
  console.log(buckets);
  console.log(chartData);

  // Convert everything to UTC for easier bucket analysis
  function offsetDate(date) {
    date = new Date(date.getTime() - (1000 * 60 * 60 * config.timezoneOffset));
    return date;
  }

  function generateTimeBuckets() {
    var startTime = customers[0].events[0];
    var lastCustomer = customers[customers.length - 1];
    var endTime = lastCustomer.events[lastCustomer.events.length - 1];
    var done = false;
    var loops = 0;
    var currentTime = offsetDate(new Date(Date.UTC(startTime.getUTCFullYear(), startTime.getUTCMonth(), startTime.getUTCDate(), 0)));
    while (!done && loops < 100) {
      if (currentTime <= endTime) {
        var bucket = {
          date: currentTime,
          label: '' + (offsetDate(currentTime).getUTCMonth() + 1) + '/' + offsetDate(currentTime).getUTCDate(),
          data: {
            engagementTotal: 0,
            customerCount: 0
          }
        }
        buckets.push(bucket);
        var periodMs;
        if (config.period == 'day') {
          periodMs = 1000 * 60 * 60 * 24;
        } else if (config.period == 'hour') {
          periodMs = 1000 * 60 * 60;
        }
        currentTime = new Date(currentTime.getTime() + periodMs);
        loops++;
      } else {
        done = true;
      }
    }
  }

  function attachCustomerData() {
    for (var i = 0; i < customers.length; i++) {
      var customer = customers[i];
      for (var j = 0; j < buckets.length; j++) {
        var bucket = buckets[j];
        if (customer.events[0].getTime() >= bucket.date.getTime() && customer.events[0].getTime() < bucket.date.getTime() + 1000 * 60 * 60 * 24) {
          var duration = customer.events[customer.events.length - 1] - customer.events[0];
          bucket.data.engagementTotal += duration;
          bucket.data.customerCount++;
        }
      }
    }
  }

  function populateChartData() {
    for (var j = 0; j < buckets.length; j++) {
      var bucket = buckets[j];
      chartData.labels.push(bucket.label);
      chartData.datasets[0].data.push(bucket.data.customerCount);
      if (bucket.data.customerCount > 0) {
        chartData.datasets[1].data.push(Math.floor(bucket.data.engagementTotal / bucket.data.customerCount / 60));
      } else {
        chartData.datasets[1].data.push(0);
      }
    }
    return true;
  }

  function buildChart() {
    var ctx = document.getElementById("engagement-chart");
    var chart = new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: {
        scales: {
          yAxes: [{
            id: 'A',
            type: 'linear',
            position: 'left',
          }, {
            id: 'B',
            type: 'linear',
            position: 'right'
          }]
        }
      }
    });
  }


}


function updateDOM() {

}
