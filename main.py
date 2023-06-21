import datetime as datetime
import discord
from discord.ext import commands
from discord.ext.commands import AutoShardedBot, errors
import asyncio
import os
import logging
import datetime
from discord.ext.commands.context import Context
from pretty_help import EmojiMenu, PrettyHelp
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv


class MyBot(AutoShardedBot):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.logger = logging.getLogger("agent-kitten")

    async def setup_hook(self) -> None:
        self.logger.info('Setting up bot...')
        self.mongodb_client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
        self.database = self.mongodb_client["agent-kitten"]
        await self.load_cogs()
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
            
    async def on_command_error(self, ctx: Context, exception: commands.CommandError):
        embed = discord.Embed(
            title="Error",
            description=f"{exception}",
            color=0xff0000,
            timestamp=datetime.datetime.now()
        ).set_footer(
            text="For help, join the support server: https://discord.gg/clowdertech"
        ).set_author(
            name=ctx.author.name,
            icon_url=ctx.author.avatar.url
        )
        await ctx.reply(embed=embed)


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
        start=datetime.datetime.now()
    ),
    help_command=PrettyHelp(
        menu=menu,
        color=0xffffff,
        show_index=True,
        show_check_failure=True,
        no_category="Commands",
        ending_note="For more help, join the support server: https://discord.gg/clowdertech"
    )
)

def main():
    if os.getenv("TOKEN") is None:
        load_dotenv()

    logger = logging.getLogger("agent-kitten")
    logger.setLevel(logging.DEBUG)
    discord_logger = logging.getLogger('discord')
    discord_logger.setLevel(logging.INFO)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    console_formatter = logging.Formatter(fmt="[%(asctime)s] [%(levelname)s] %(name)s: %(message)s [%(filename)s:%(lineno)d]", datefmt="%Y-%m-%d %H:%M:%S", style="%")
    console_handler.setFormatter(console_formatter)

    logger.addHandler(console_handler)
    discord_logger.addHandler(console_handler)
    
    if os.getenv("TOKEN") is None:
        logger.error("No token provided!")
        return
    
    if os.getenv("MONGODB_URI") is None:
        logger.error("No MongoDB URI provided!")
        return
    
    if os.getenv("TEXTGEN_API_URL") is None:
        logger.error("No Textgen API URL provided!")
        return

    bot.run(os.getenv('TOKEN'), log_handler=None)


if __name__ == "__main__":
    main()
