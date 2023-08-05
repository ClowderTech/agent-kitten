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


class MyBot(AutoShardedBot):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.logger = logging.getLogger("agent-kitten")
        self.cache = {}
        self.temp_moderated_messages = {}
        self.temp_edited_message_retain = {}
        self.temp_deleted_message_retain = {}


    async def setup_hook(self) -> None:
        self.logger.info('Setting up bot...')
        self.mongodb_client = AsyncIOMotorClient(str(os.getenv("MONGODB_URI")))
        self.database = self.mongodb_client["agent-kitten"]
        await self.load_cogs()
        self.logger.info('Bot setup complete.')

    async def load_cogs(self):
        for filename in os.listdir('./cogs'):
            if filename.endswith('.py'):
                await self.load_extension(f'cogs.{filename[:-3]}')
                self.logger.info(f'Loaded {filename[:-3]}')

    async def on_ready(self):
        if self.user is None:
            return
        
        self.logger.info(f'Logged in as {self.user} (ID: {self.user.id})')

        for channel in self.get_all_channels():
            if channel.permissions_for(channel.guild.me).read_message_history:
                if isinstance(channel, (discord.TextChannel, discord.Thread, discord.VoiceChannel, discord.StageChannel)):
                    async for message in channel.history(limit=2500):
                        self.cache[message.id] = message

        self.logger.info('Caching complete.')

    async def on_guild_join(self, guild):
        self.logger.info(f'Joined guild {guild.name} (ID: {guild.id})')

        for channel in guild.channels:
            if channel.permissions_for(guild.me).read_message_history:
                if isinstance(channel, (discord.TextChannel, discord.Thread, discord.VoiceChannel, discord.StageChannel)):
                    async for message in channel.history(limit=2500):
                        self.cache[message.id] = message

        self.logger.info('Caching complete.')

    async def on_guild_channel_update(self, before, after):
        if after.permissions_for(after.guild.me).read_message_history and not before.permissions_for(before.guild.me).read_message_history:
            if isinstance(after, (discord.TextChannel, discord.Thread, discord.VoiceChannel, discord.StageChannel)):
                async for message in after.history(limit=2500):
                    self.cache[message.id] = message

    async def on_thread_update(self, before, after):
        if after.permissions_for(after.me).read_message_history and not before.permissions_for(before.me).read_message_history:
            async for message in after.history(limit=2500):
                self.cache[message.id] = message

    async def on_message(self, message):
        self.cache[message.id] = message
        await self.process_commands(message)

    async def on_raw_message_edit(self, payload):
        self.temp_edited_message_retain[payload.message_id] = {}

        channel = self.get_channel(payload.channel_id)

        if channel is None:
            channel = await self.fetch_channel(payload.channel_id)

        if not isinstance(channel, (discord.TextChannel, discord.Thread, discord.VoiceChannel, discord.StageChannel)):
            return

        message = await channel.fetch_message(payload.message_id)
        
        await asyncio.sleep(0.1)
        if len(self.temp_edited_message_retain[payload.message_id]) != 0:
            while not all(event_done for event_done in self.temp_edited_message_retain[payload.message_id].values()):
                await asyncio.sleep(0.1)

        try:
            self.cache[payload.message_id] = message
        except KeyError:
            pass
        del self.temp_edited_message_retain[payload.message_id]

    async def on_raw_message_delete(self, payload):
        self.temp_deleted_message_retain[payload.message_id] = {}

        await asyncio.sleep(0.1)
        if len(self.temp_deleted_message_retain[payload.message_id]) != 0:
            while not all(event_done for event_done in self.temp_deleted_message_retain[payload.message_id].values()):
                await asyncio.sleep(0.1)

        try:
            del self.cache[payload.message_id]
        except KeyError:
            pass
        del self.temp_deleted_message_retain[payload.message_id]

    async def on_command_error(self, ctx: Context, exception: commands.CommandError):
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
            text=f"For help, use {ctx.prefix}help <command> or join the support server at https://discord.gg/clowdertech.",
        )

        if ctx.interaction is None:
            await ctx.reply(embed=embed, delete_after=10)
        else:
            await ctx.reply(embed=embed, ephemeral=True)

menu = AppMenu()

bot = MyBot(
    command_prefix=commands.when_mentioned_or("ak!"),
    intents=discord.Intents.all(),
    activity=discord.Activity(type=discord.ActivityType.watching, name="ak!help"),
    allowed_mentions=discord.AllowedMentions.none(),
    help_command=PrettyHelp(
        menu=menu,
        color=discord.Color(0xffffff),
        show_index=True,
        show_check_failure=True,
        delete_invoke=False,
        send_typing=False,
        sort_commands=True,

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
    
    if os.getenv("OPENAI_ORG_ID") is None:
        logger.error("No OpenAI Organization ID provided!")
        return
    
    if os.getenv("OPENAI_API_KEY") is None:
        logger.error("No OpenAI API key provided!")
        return

    bot.run(str(os.getenv('TOKEN')), log_handler=None)


if __name__ == "__main__":
    main()