import datetime as datetime
from typing import List, Any
import discord
from discord.ext import commands
from discord.ext.commands import AutoShardedBot, errors
from discord.app_commands import Command, AppCommand
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
from pathlib import Path

def get_all_files(path: Path | str) -> List[Path]:
    if isinstance(path, str):
        path = Path(path)

    if not path.exists():
        raise ValueError(f'Path {path} does not exist')
    
    if not path.is_dir():
        raise ValueError(f'Path {path} is not a directory')
        
    output = []
    for npath in path.iterdir():
        if npath.is_file():
            output.append(npath)
        elif npath.is_dir():
            output.append(get_all_files(npath))
    output = remove_nestings(output)
    return output

def remove_nestings(l: List[Any]) -> List[Any]:
    output = []
    for i in l:
        if type(i) == list:
            output += remove_nestings(i)
        else:
            output.append(i)
    return output

def get_all_files_moduled(path: Path | str) -> List[str]: 
    if isinstance(path, str):
        path = Path(path)

    if not path.exists():
        raise ValueError(f'Path {path} does not exist')
    
    if not path.is_dir():
        raise ValueError(f'Path {path} is not a directory')

    new_files = []

    for file in get_all_files(path):
        if file.suffix == '.py':
            final = ""
            for parent in file.parents:
                if parent.absolute() != file.cwd():
                    final += f"{parent.name}."
            final += file.stem
            new_files.append(final)
        
    return new_files

def if_all_commands_synced(local_commands: List[str], server_commands: List[AppCommand]) -> bool:
    commands_synced = True
    for local_command in local_commands:
        command_synced = False
        for server_command in server_commands:
            if not isinstance(local_command, Command):
                continue
            elif server_command.name != local_command.name:
                continue
            elif server_command.description != local_command.description:
                continue
            elif server_command.default_member_permissions != local_command.default_permissions:
                continue
            elif server_command.nsfw != local_command.nsfw:
                continue
            options_synced = True
            for local_option in local_command.parameters:
                option_synced = False
                for server_option in server_command.options:
                    if server_option.name != local_option.name:
                        continue
                    if server_option.description != local_option.description:
                        continue
                    if server_option.required != local_option.required:
                        continue
                    option_synced = True

                if not option_synced:
                    options_synced = False
                    break

            if not options_synced:
                continue

            command_synced = True
        
        if not command_synced:
            commands_synced = False
            break

    return commands_synced

class MyBot(AutoShardedBot):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.logger = logging.getLogger("agentkitten")
        self.cache = {}

    def exit_gracefully(self, signal, frame):
        self.logger.info(f"Received signal {signal}. Exiting...")
        self.mongodb_client.close()
        self.loop.create_task(self.openai.close())
        # self.loop.create_task(self.app.shutdown())
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
        # self.app = Quart("Agent Kitten Web UI")
        # self.app.secret_key = os.getenv("SECRET_KEY")
        # self.app.config["DISCORD_CLIENT_ID"] = os.getenv("CLIENT_ID")
        # self.app.config["DISCORD_CLIENT_SECRET"] = os.getenv("CLIENT_SECRET")
        # self.app.config["DISCORD_REDIRECT_URI"] = os.getenv("REDIRECT_URI")
        # self.app.config["DISCORD_BOT_TOKEN"] = os.getenv("TOKEN")
        # await self.load_blueprints()
        # self.loop.create_task(self.app.run_task(host="0.0.0.0", port=5000))

        server_commands = await self.tree.fetch_commands()
        local_commands = self.tree.get_commands()

        commands_synced = if_all_commands_synced(local_commands, server_commands)

        if not commands_synced:
            self.logger.warning("Commands not synced with server, re-syncing...")
            await self.tree.sync()
            self.logger.warning("Commands synced with server.")

        self.logger.info('Bot setup complete.')

    async def load_cogs(self):
        for file in get_all_files_moduled("./cogs"):
            await self.load_extension(file)
            self.logger.info(f'Loaded {file}')

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
