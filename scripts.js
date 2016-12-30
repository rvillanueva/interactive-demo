'use strict';

var config = {
  timeThreshold: 60,
  sensorThreshold: 30,
  timezoneOffset: -5,
  period: 'day',
  colors: ['#94aafb', '#a4e675']
}

//  Interactive brand colors: ['#708CF8', '#7AC943']

var log, customers, failed, eventOutput, data, chartData, chart;

// Load events from static text file

function loadEvents(done) {
  var client = new XMLHttpRequest();
  client.open('GET', 'events_output.txt');
  client.onreadystatechange = function() {
    if (client.readyState == 4 && client.status == 200 && client.responseText) {
      done(client.responseText);
    }
  }
  client.send();
}

loadEvents(function(data) {
  eventOutput = data;
  updateEventInput(data);
  processInput();
});

// Updating DOM with loaded text file

function updateEventInput(text) {
  document.getElementById("event-output").value = text;
}

// Load config file from DOM settings when running manually

function loadConfig() {
  eventOutput = document.getElementById("event-output").value;
  config.timeThreshold = Number(document.getElementById("time-threshold").value);
  config.sensorThreshold = Number(document.getElementById("sensor-threshold").value);
  config.timezoneOffset = Number(document.getElementById("timezone-offset").value);
}

// Process event output data

function processInput() {
  if (!eventOutput) {
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
      dateRange: '',
      dailyCustomers: '',
      averageEngagement: ''
    }
  }
  log = parseEventLog(eventOutput);
  var uncleaned = splitCustomers(log);
  customers = clearSensorErrors(uncleaned);
  generateCharts(customers);
  calculateMetrics();
  updateDOM();

  function parseEventLog(input) {
    var split = input.split('\n');
    var arr = [];
    for (var i = 0; i < split.length; i++) {
      var string = split[i] + 'z'; // setting these times are UTC, because it would be weird for people to be interacting at 2am Eastern
      var date = new Date(string);
      if (!isNaN(date)) {
        arr.push(date);
        data.parsed.passed++;
      } else {
        data.parsed.failed++;
      }
    }
    return arr;
  }

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
    var res = {
      passed: [],
      failed: []
    };
    for (var i = 0; i < customers.length; i++) {
      var customer = customers[i];
      if (customer.events.length <= config.sensorThreshold) {
        res.passed.push(customer);
      } else {
        res.failed.push(customer)
      }
    }
    data.cleaned = {
      passed: res.passed.length,
      failed: res.failed.length
    }
    return res.passed;
  }
}



// Generate charts for display on webpage
function generateCharts(customers) {
  if(chart){
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
    data.periods = buckets.length;
  }

  function attachCustomerData() {
    for (var i = 0; i < customers.length; i++) {
      var customer = customers[i];
      for (var j = 0; j < buckets.length; j++) {
        var bucket = buckets[j];
        if (customer.events[0].getTime() >= bucket.date.getTime() && customer.events[0].getTime() < bucket.date.getTime() + 1000 * 60 * 60 * 24) {
          var duration = (customer.events[customer.events.length - 1].getTime() - customer.events[0].getTime())/60;
          bucket.data.engagementTotal += duration;
          data.totalEngagement += duration;
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
    ctx.canvas.height = 500;
    chart = new Chart(ctx, {
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


// Use combine existing data to store metrics
function calculateMetrics(){
  data.totalCustomers = data.cleaned.passed;
  data.outputs.dailyCustomers = data.totalCustomers/data.periods;
  data.outputs.averageEngagement = data.totalEngagement/data.totalCustomers/60;
  data.outputs.dateRange = '' + chartData.labels[0] + ' - ' + chartData.labels[chartData.labels.length - 1];
}

function updateDOM(){
  var dateRange = document.getElementById("data-date-range");
  var customerAverage = document.getElementById("data-customer-average");
  var engagement = document.getElementById("data-engagement");
  var parsePassed = document.getElementById("parsed-passed");
  var parseFailed = document.getElementById("parsed-failed");
  var sensorPassed = document.getElementById("sensor-passed");
  var sensorFailed = document.getElementById("sensor-failed");

  dateRange.innerHTML = data.outputs.dateRange;
  customerAverage.innerHTML = Math.floor(data.outputs.dailyCustomers);
  engagement.innerHTML = Math.floor(data.outputs.averageEngagement) + ' mins';
  parsePassed.innerHTML = data.parsed.passed;
  parseFailed.innerHTML = data.parsed.failed;
  sensorPassed.innerHTML = data.cleaned.passed;
  sensorFailed.innerHTML = data.cleaned.failed;

}
