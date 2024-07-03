import datetime as datetime
import discord
from discord.ext import commands
from discord.ext.commands import AutoShardedBot, errors
import asyncio
import os
import logging
import datetime
from discord.ext.commands.context import Context
from pretty_help import AppMenu, PrettyHelp
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from openai import AsyncOpenAI
import signal
from quart import Quart


class MyBot(AutoShardedBot):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.logger = logging.getLogger("agentkitten")
        self.cache = {}

    def exit_gracefully(self, signal, frame):
        self.logger.info(f"Received signal {signal}. Exiting...")
        self.mongodb_client.close()
        self.loop.create_task(self.openai.close())
        self.loop.create_task(self.app.shutdown())
        self.loop.create_task(self.close())

    async def setup_hook(self) -> None:
        self.logger.info('Setting up bot...')
        self.mongodb_client = AsyncIOMotorClient(str(os.getenv("MONGODB_URI")))
        self.database = self.mongodb_client["agentkitten"]
        self.openai = AsyncOpenAI(
            api_key=str(os.getenv("OPENAI_API_KEY")),
            organization=str(os.getenv("OPENAI_ORG_ID"))
        )
        await self.load_cogs()
        self.app = Quart("Agent Kitten Web UI")
        self.app.secret_key = os.getenv("SECRET_KEY")
        self.app.config["DISCORD_CLIENT_ID"] = os.getenv("CLIENT_ID")
        self.app.config["DISCORD_CLIENT_SECRET"] = os.getenv("CLIENT_SECRET")
        self.app.config["DISCORD_REDIRECT_URI"] = os.getenv("REDIRECT_URI")
        self.app.config["DISCORD_BOT_TOKEN"] = os.getenv("TOKEN")
        await self.load_blueprints()
        self.loop.create_task(self.app.run_task(host="0.0.0.0", port=5000))
        self.logger.info('Bot setup complete.')

    async def load_cogs(self):
        for filename in os.listdir('./cogs'):
            if filename.endswith('.py'):
                await self.load_extension(f'cogs.{filename[:-3]}')
                self.logger.info(f'Loaded {filename[:-3]}')

    async def load_blueprints(self):
        for foldername in os.listdir('./blueprints'):
            blueprint = __import__(f'blueprints.{foldername}', fromlist=['blueprint'])
            try:
                await blueprint.init(self.app, self.loop)
            except AttributeError:
                pass
            self.app.register_blueprint(blueprint.blueprint)

    async def on_ready(self):
        if self.user is None:
            return

        self.logger.info(f'Logged in as {self.user} (ID: {self.user.id})')

    async def on_command_error(
            self,
            ctx: Context,
            exception: commands.CommandError):
        self.logger.error(f"Error in command {
                          ctx.command}:", exc_info=exception)

        if ctx.author.avatar is None:
            avatar_url = ctx.author.default_avatar.url
        else:
            avatar_url = ctx.author.avatar.url

        embed = discord.Embed(
            title="Error",
            description=f"{exception}"[:4095],
            color=0xff0000,
            timestamp=datetime.datetime.now()
        ).set_author(
            name=ctx.author.name,
            icon_url=avatar_url
        ).set_footer(
            text=f"For help, go to https://discord.clowdertech.com/ or join the support server!",
        )

        if ctx.interaction is None:
            await ctx.reply(embed=embed, delete_after=10)
        else:
            await ctx.reply(embed=embed, ephemeral=True)


def main():
    try:
        load_dotenv(override=True)
    except BaseException:
        pass

    menu = AppMenu()

    bot = MyBot(
        command_prefix=commands.when_mentioned_or("ak!"),
        intents=discord.Intents.all(),
        activity=discord.Activity(
            type=discord.ActivityType.watching, name="ak!help"),
        allowed_mentions=discord.AllowedMentions.none(),
        help_command=PrettyHelp(
            menu=menu,
            color=discord.Color(0xffffff),
            show_index=True,
            show_check_failure=True,
            delete_invoke=False,
            send_typing=False,
            sort_commands=True
        )
    )

    logger = logging.getLogger("agentkitten")
    logger.setLevel(logging.DEBUG)
    discord_logger = logging.getLogger('discord')
    discord_logger.setLevel(logging.INFO)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    console_formatter = logging.Formatter(
        fmt="[%(asctime)s] [%(levelname)s] %(name)s: %(message)s [%(filename)s:%(lineno)d]",
        datefmt="%Y-%m-%d %H:%M:%S", style="%")
    console_handler.setFormatter(console_formatter)

    logger.addHandler(console_handler)
    discord_logger.addHandler(console_handler)

    if os.getenv("TOKEN") is None:
        logger.error("No token provided!")
        return

    if os.getenv("MONGODB_URI") is None:
        logger.error("No MongoDB URI provided!")
        return

    if os.getenv("OPENAI_ORG_ID") is None:
        logger.error("No OpenAI Organization ID provided!")
        return

    if os.getenv("OPENAI_API_KEY") is None:
        logger.error("No OpenAI API key provided!")
        return

    signal.signal(signal.SIGINT, bot.exit_gracefully)
    signal.signal(signal.SIGTERM, bot.exit_gracefully)

    bot.run(str(os.getenv('TOKEN')), log_handler=None)


if __name__ == "__main__":
    main()
