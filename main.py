import os
import glob

import jinja2
import webapp2

import views


JINJA_ENVIRONMENT = jinja2.Environment(
    loader=jinja2.FileSystemLoader(os.path.join(os.path.dirname(__file__), 'templates')),
    extensions=['jinja2.ext.autoescape'],
    autoescape=True)


class MainPage(webapp2.RequestHandler):
    def get(self):
        template_values = {
        }

        template = JINJA_ENVIRONMENT.get_template('index.html')
        self.response.write(template.render(template_values))


class Index(webapp2.RequestHandler):
    def get(self, subdir):
        dir = os.path.join('static', subdir)
        contents = glob.glob(os.path.join(dir, '*'))
        contents = [path.replace(dir, '') for path in contents]

        files = []
        dirs = []
        for path in contents:
            if path.startswith('/'):
                path = path[1:]
            full_path = os.path.join('/', subdir, path)

            if path == 'index.html':
                self.redirect(full_path)

            if '.' in path:
                files.append({'text': path, 'path': full_path, 'dir': False})
            else:
                dirs.append({'text': path, 'path': full_path, 'dir': True})
        dirs.insert(0, {'text': '..', 'path': os.path.join('/', subdir, '..'), 'dir': True})
        template_values = {
            'links': dirs + files,
        }
        template = JINJA_ENVIRONMENT.get_template('index.html')
        self.response.write(template.render(template_values))

app = webapp2.WSGIApplication([
    ('/', MainPage),
    ('/passthrough', views.Passthrough),
    #('/([^\.]*/?)', Index),
], debug=True)
