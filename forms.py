from flask_wtf import FlaskForm
from flask_wtf.file import FileField, FileRequired, FileAllowed
from wtforms import StringField, PasswordField, BooleanField, DateField, SubmitField
from wtforms.validators import DataRequired, Email, EqualTo, Length, Optional
from wtforms.widgets import DateInput

class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired(), Length(min=3, max=80)])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me')
    submit = SubmitField('Sign In')

class SignUpForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired(), Length(min=3, max=80)])
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired(), Length(min=6)])
    password_confirm = PasswordField('Confirm Password', 
                                   validators=[DataRequired(), EqualTo('password', message='Passwords must match')])
    submit = SubmitField('Sign Up')

class UploadForm(FlaskForm):
    file = FileField('Excel File', validators=[
        FileRequired(),
        FileAllowed(['xlsx'], 'Only .xlsx files are allowed!')
    ])
    date_from = DateField('From Date (optional)', validators=[Optional()], widget=DateInput())
    date_to = DateField('To Date (optional)', validators=[Optional()], widget=DateInput())
    submit = SubmitField('Upload and Process')