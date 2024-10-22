import { Resend } from 'resend';
import * as React from 'react';

async function send_mail(env, weather_json) {
  const resend = new Resend(env.MAIL_KEY);
  const data = await resend.emails.send({
    from: env.MAIL_FROM,
    to: [env.MAIL_TO],
    subject: weather_json.summary,
    html: '<div><h1>Hi, RAIN!</h1><pre>{' + JSON.stringify(weather_json, null, 2) + '}</pre></div>',
  });
  return data
}

async function check_weather_status(weather_json, env) {
  var status_data = await env.weather.get("cur_weather_status");
  var time_data = await env.weather.get("cur_status_time");
  let weather_status: boolean = false;
  if (status_data != 'null') {
    weather_status = (status_data === "true")
  }
  var last_status_time: string = (new Date()).toISOString()
  if (time_data != 'null') {
    last_status_time = time_data
  }

  var start_index = 0
  var count = 0
  var mail_result
  for (let index = 0; index < weather_json.minutely.length; index++) {
    const element = weather_json.minutely[index];
    var loop_status = Number(element.precip) > 1
    var diff = Date.parse(last_status_time) - Date.parse(element.fxTime);
    if (diff >= 0) { continue; }

    if (status_data == null) {
      weather_status = loop_status
      time_data = element.fxTime
      last_status_time = time_data
    }
    else if (weather_status != loop_status) {
      if (start_index + 1 == index) {
        count++;
        start_index++;
      } else {
        count = 0
        start_index = index
      }

      if (count >= 3) {
        weather_status = loop_status
        time_data = element.fxTime
        mail_result = await send_mail(env, weather_json)
        break
      }
    }
  }
  await env.weather.put("cur_weather_status", String(weather_status));
  await env.weather.put("cur_status_time", String(time_data));
  return mail_result
}

async function req_weather_data(env) {
  var url = env.API_HOST
  var key = env.API_ACCOUNT_ID
  var location_pos = env.API_ACCOUNT_POS

  var req_url = url + location_pos + '&' + key
  const weather_response = await fetch(req_url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  })

  if (!weather_response.ok || weather_response.status != 200) {
    throw new Error(`Response status: ${weather_response.status}`);
  }

  var response_json = await weather_response.json();
  if (response_json.code != '200') {
    throw new Error(`Response code: ${response_json.code}`);
  }

  //console.log(response_json);
  return response_json
}

export default {
  async fetch(request, env, context): Promise<Response> {
    var request_url = decodeURI(request.url)
    if (request_url != env.SELF_HOST_HTTP && request_url != env.SELF_HOST_HTTPS) {
      return new Response('url_error');
    }
    var weather_json = await req_weather_data(env)
    var mail_result = await check_weather_status(weather_json, env)
    return new Response(JSON.stringify(Object.assign(weather_json, mail_result)), { headers: { "content-type": 'application/json' } });
  },

  async scheduled(event, env, ctx) {
    var weather_json = await req_weather_data(env)
    var mail_result = await check_weather_status(weather_json, env)
    console.log(Object.assign(weather_json, mail_result))
  },

};
