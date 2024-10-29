import webapp2
import urllib.request


class Passthrough(webapp2.RequestHandler):
    def get(self):
        url = self.request.get('url', '')
        ip = self.request.environ.get('HTTP_X_REAL_IP', self.request.remote_addr)
        url = url.replace('geoip=true', 'geoip={}'.format(ip))

        req = urllib.request.Request(url)
        response = urllib.request.urlopen(req)
        data = response.read()

        self.response.headers.add_header("Access-Control-Allow-Origin", "*")
        self.response.headers['Content-Type'] = 'application/json'
        self.response.write(data)
