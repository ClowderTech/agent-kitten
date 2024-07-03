from quart import Blueprint, render_template, redirect, url_for, current_app, Quart
from quartcord import DiscordOAuth2Session, requires_authorization, Unauthorized
import asyncio

blueprint = Blueprint('discord', __name__, url_prefix="/discord", template_folder='templates')


async def init(app: Quart, loop: asyncio.BaseEventLoop):
    async with app.app_context():
        global discordOAuth2
        discordOAuth2 = DiscordOAuth2Session(current_app)


@blueprint.route("/login/")
async def login():
    return await discordOAuth2.create_session()


@blueprint.route("/callback/")
async def callback():
    await discordOAuth2.callback()
    return redirect(url_for("discord.me"))


@blueprint.errorhandler(Unauthorized)
async def redirect_unauthorized(e):
    return redirect(url_for("discord.login"))


@blueprint.route("/me/")
@requires_authorization
async def me():
    user = await discordOAuth2.fetch_user()
    return await render_template("me.html", user=user)
