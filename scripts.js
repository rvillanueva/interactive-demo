'use strict';

var config = {
  timeThreshold: 60,
  sensorThreshold: 30,
  timezoneOffset: -5,
  period: 'day',
  colors: ['#94aafb', '#a4e675']
}

//  Brand colors: ['#708CF8', '#7AC943']

var data, chartData, chart;

// Load events from static text file

function loadEvents(done) {
  var client = new XMLHttpRequest();
  client.open('GET', '/interactive-demo/events_output.txt');
  client.onreadystatechange = function() {
    if (client.readyState == 4 && client.status == 200 && client.responseText) {
      done(client.responseText);
    }
  }
  client.send();
}

loadEvents(function(data) {
  updateEventInput(data);
  processInput(data);
});

// Updating DOM with loaded text file

function updateEventInput(text) {
  document.getElementById("event-output").value = text;
}

// Load config file from DOM settings when running manually

function runAnalysis() {
  var eventOutput = document.getElementById("event-output").value;
  config.timeThreshold = Number(document.getElementById("time-threshold").value);
  config.sensorThreshold = Number(document.getElementById("sensor-threshold").value);
  config.timezoneOffset = Number(document.getElementById("timezone-offset").value);
  processInput(eventOutput);
}

// Process event output data

function processInput(text) {
  if (!text) {
    alert('Please copy event output file into the text area before running.')
    return false;
  }
  data = {
    parsed: {
      passed: 0,
      failed: 0
    },
    cleaned: {
      passed: 0,
      failed: 0
    },
    totalCustomers: 0,
    totalEngagement: 0,
    periods: 0,
    outputs: {
      dateRange: null,
      dailyCustomers: null,
      averageEngagement: null
    }
  };

  var eventLog = parseEventLog(text);
  var allCustomers = splitCustomers(eventLog);
  if (allCustomers.length > 0) {
    var customers = clearSensorErrors(allCustomers);
    generateCharts(customers);
    calculateMetrics();
  }
  updateDOM();

  // Convert the raw text into an array of Dates
  function parseEventLog(input) {
    var split = input.split('\n');
    var arr = [];
    for (var i = 0; i < split.length; i++) {
      var string = split[i]; // setting these times are UTC, because it would be weird for people to be interacting at 2am Eastern
      var date = new Date(string + 'Z');
      if (isNaN(date)) {
        date = parseDate(string);
      }
      // Update data log
      if (!isNaN(date)) {
        arr.push(date);
        data.parsed.passed++;
      } else {
        data.parsed.failed++;
      }
    }
    return arr;

    function parseDate(str) {
      if (str.length > 20) {
        var year = Number(str.substring(0, 4));
        var month = Number(str.substring(5, 7)) - 1;
        var day = Number(str.substring(8, 10));
        var hour = Number(str.substring(11, 13));
        var minute = Number(str.substring(14, 16));
        var seconds = Number(str.substring(17, 19));
        var ms = Number(str.substring(19, str.length)) * 10;
        return new Date(Date.UTC(year, month, day, hour, minute, seconds, ms));
      } else {
        return 'NaN';
      }
    }
  }

  // Create a new customer bucket when the last event is older than the time cutoff
  function splitCustomers(log) {
    var res = [];
    var lastTime;
    for (var i = 0; i < log.length; i++) {
      var checked = log[i];
      if (i === 0 || lastTime.getTime() < (checked.getTime() - (config.timeThreshold * 1000))) {
        res.push({
          events: []
        });
      }
      res[res.length - 1].events.push(checked);
      lastTime = checked;
    }
    return res;
  }

  // Clear customers who have more than a certain number of events
  function clearSensorErrors(customers) {
    var passed = [];
    var failed = [];
    for (var i = 0; i < customers.length; i++) {
      var customer = customers[i];
      if (customer.events.length <= config.sensorThreshold) {
        passed.push(customer);
      } else {
        failed.push(customer)
      }
    }
    // Update data logs
    data.cleaned = {
      passed: passed.length,
      failed: failed.length
    }
    return passed;
  }
}



// Generate charts for display on webpage
function generateCharts(customers) {
  if (chart) {
    chart.destroy();
  }
  var buckets = [];
  chartData = {
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
  buildChart();

  // Convert everything to UTC for easier bucket analysis
  function offsetDate(date) {
    date = new Date(date.getTime() - (1000 * 60 * 60 * config.timezoneOffset));
    return date;
  }

  // Generate buckets for each day
  function generateTimeBuckets() {
    var startTime = customers[0].events[0];
    var lastCustomer = customers[customers.length - 1];
    var endTime = lastCustomer.events[lastCustomer.events.length - 1];
    var done = false;
    var loops = 0;
    // Offset the time based on the location's timezone, so events don't leak past midnight
    var currentTime = offsetDate(new Date(Date.UTC(startTime.getUTCFullYear(), startTime.getUTCMonth(), startTime.getUTCDate(), 0)));

    // Build buckets until you have a bucket for the latest event or you hit 100
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
    data.periods = buckets.length;
  }

  // Put customer data into the correct bucket based on the bucket's start time
  function attachCustomerData() {
    for (var i = 0; i < customers.length; i++) {
      var customer = customers[i];
      for (var j = 0; j < buckets.length; j++) {
        var bucket = buckets[j];
        if (customer.events[0].getTime() >= bucket.date.getTime() && customer.events[0].getTime() < bucket.date.getTime() + 1000 * 60 * 60 * 24) {
          var duration = (customer.events[customer.events.length - 1].getTime() - customer.events[0].getTime()) / 60;
          bucket.data.engagementTotal += duration;
          data.totalEngagement += duration;
          bucket.data.customerCount++;
        }
      }

    }
  }

  // Compile bucket data into Chart.js format
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

  // Build Chart object with Chart.js
  function buildChart() {
    var ctx = document.getElementById("engagement-chart");
    ctx.getContext("2d").height = 500;
    chart = new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
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


// Combine existing data to store metrics
function calculateMetrics() {
  data.totalCustomers = data.cleaned.passed;
  data.outputs.dailyCustomers = data.totalCustomers / data.periods;
  data.outputs.averageEngagement = data.totalEngagement / data.totalCustomers / 60;
  data.outputs.dateRange = '' + chartData.labels[0] + ' - ' + chartData.labels[chartData.labels.length - 1];
}

function updateDOM() {
  var dateRange = document.getElementById("data-date-range");
  var customerAverage = document.getElementById("data-customer-average");
  var engagement = document.getElementById("data-engagement");
  var parsePassed = document.getElementById("parsed-passed");
  var parseFailed = document.getElementById("parsed-failed");
  var sensorPassed = document.getElementById("sensor-passed");
  var sensorFailed = document.getElementById("sensor-failed");

  dateRange.innerHTML = data.outputs.dateRange || 'None';
  customerAverage.innerHTML = Math.floor(data.outputs.dailyCustomers) || 0;
  engagement.innerHTML = (Math.floor(data.outputs.averageEngagement) || 0) + ' mins';
  parsePassed.innerHTML = data.parsed.passed;
  parseFailed.innerHTML = data.parsed.failed;
  sensorPassed.innerHTML = data.cleaned.passed;
  sensorFailed.innerHTML = data.cleaned.failed;

}
