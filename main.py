import datetime as datetime
import discord
from discord.ext import commands
from discord.ext.commands import AutoShardedBot
import asyncio
import os
import logging
import datetime
from pretty_help import EmojiMenu, PrettyHelp
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv


class MyBot(AutoShardedBot):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.logger = logging.getLogger(__name__)

    async def setup_hook(self) -> None:
        self.logger.info('Setting up bot...')
        self.mongodb_client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
        self.database = self.mongodb_client["agent-kitten"]
        await self.load_cogs()
        await bot.tree.sync()
        self.logger.info('Bot setup complete.')

    async def load_cogs(self):
        for filename in os.listdir('./cogs'):
            if filename.endswith('.py'):
                await self.load_extension(f'cogs.{filename[:-3]}')
                self.logger.info(f'Loaded {filename[:-3]}')

    async def on_ready(self):
        self.logger.info(f'Logged in as {self.user} (ID: {self.user.id})')

    async def on_message(self, message):
        if message.author.bot:
            return
        if message.guild is None:
            self.logger.debug(
                f'@{message.author} ({message.author.id}) sent a message in DMs: {message.content} ({message.id})')
        else:
            self.logger.debug(
                f'@{message.author} ({message.author.id}) sent a message in #{message.channel} ({message.channel.id}) at {message.guild} ({message.guild.id}): {message.content} ({message.id})')
        await self.process_commands(message)

    async def on_raw_message_edit(self, payload):
        channel = self.get_channel(payload.channel_id)
        if channel is None:
            return
        message = await channel.fetch_message(payload.message_id)
        if message.author.bot:
            return
        if message.guild is None:
            self.logger.debug(
                f'@{message.author} ({message.author.id}) edited a message in DMs: {message.content} ({message.id})')
        else:
            self.logger.debug(
                f'@{message.author} ({message.author.id}) edited a message in #{message.channel} ({message.channel.id}) at {message.guild} ({message.guild.id}): {message.content} ({message.id})')

menu = EmojiMenu(
    active_time=60,
    page_left="⬅️",
    page_right="➡️",
    remove="❌"
)

bot = MyBot(
    command_prefix='~',
    intents=discord.Intents.all(),
    activity=discord.Game(
        name="~help",
        start=datetime.datetime.utcnow()
    ),
    help_command=PrettyHelp(
        menu=menu,
        color=0xffffff,
        show_index=True,
        show_check_failure=True,
        no_category="Commands",
        ending_note="For more help, join the support server: https://discord.gg/uefta"
    )
)


class CustomFormatter(logging.Formatter):
    grey = "\x1b[90m"
    green = "\x1b[92m"
    yellow = "\x1b[33m"
    red = "\x1b[91m"
    bold_red = "\x1b[31m"
    reset = "\x1b[0m"
    format = "[%(asctime)s] [%(levelname)s] %(name)s: %(message)s [%(filename)s:%(lineno)d]"

    FORMATS = {
        logging.DEBUG: grey + format + reset,
        logging.INFO: green + format + reset,
        logging.WARNING: yellow + format + reset,
        logging.ERROR: red + format + reset,
        logging.CRITICAL: bold_red + format + reset
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno)
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)


def main():
    load_dotenv()

    logger = logging.getLogger(__name__)
    logger.setLevel(logging.DEBUG)
    discord_logger = logging.getLogger('discord')
    discord_logger.setLevel(logging.INFO)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(CustomFormatter())

    logger.addHandler(console_handler)
    discord_logger.addHandler(console_handler)

    bot.run(os.getenv('TOKEN'), log_handler=None)


if __name__ == "__main__":
    main()
