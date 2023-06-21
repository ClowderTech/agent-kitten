import discord
from discord.ext import commands
import time
from platform import python_version
import asyncio
import concurrent.futures
import datetime
import re
import typing
import aiofiles
import os
import googlesearch
import random
import math
from datetime import date
import aiohttp


class TextGen(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.event_loop = asyncio.get_event_loop()
        self.instructions = f"You are Agent Kitten, a helpful AI assistant made by the ClowderTech Corperation. Below is an instruction that describes a task written by a user that may include some search results. Write a response that appropriately completes the request. Use context from previous answers, questions, and the provided search results that will help complete the request if you can not without them. Current date: {date.today().strftime('%d/%m/%Y')}.\n\n### User: How many letters are there in the English alphabet?\n### Search Term: Number of letters in the english alphabet\n### Search Results: [1] \"The English Alphabet consists of 26 letters: A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z.\" (https://www.worldometers.info/languages/how-many-letters-alphabet/)\n### Agent Kitten: There are 26 letters in the English Alphabet\n\n### User: What are those letters?\n### Search Term: List the letters of the english alphabet\n### Search Results: [1] \"The English Alphabet consists of 26 letters: A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z.\" (https://www.worldometers.info/languages/how-many-letters-alphabet/)\n### Agent Kitten: The letters are A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, and Z.\n\n### User: Can you give me a link to where it states this?\n### Search Term: None\n### Search Results: None\n### Agent Kitten: Here is the link of where it states that there are 26 letters in the English alphabet: https://www.worldometers.info/languages/how-many-letters-alphabet/"
        self.remembered = {}
        self.search_results_amount = 3
        self.api_url = os.getenv("TExTGEN_API_URL")
        self.collection = self.bot.database["text-gen"]

    async def generate(self, message: str):
        pattern2 = re.compile(
            r"###|</s>")

        send_data = {
            "prompt": message,
            "max_new_tokens": 256,
            "do_sample": True,
            "temperature": 0.5,
            "top_p": 1,
            "typical_p": 1,
            "repetition_penalty": 1.1,
            "top_k": 0,
            "min_length": 0,
            "no_repeat_ngram_size": 0,
            "num_beams": 1,
            "penalty_alpha": 0,
            "length_penalty": 1,
            "early_stopping": False,
            "seed": -1,
            "add_bos_token": True,
            "stopping_strings": [
                "\n###"
            ],
            "truncation_length": 2048,
            "ban_eos_token": False,
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.api_url}/v1/generate", json=send_data) as response:
                if response.ok:
                    response_json = await response.json()
                    try:
                        new_message = response_json["results"][0]["text"]
                        new_message = pattern2.sub("", new_message).strip()
                        self.bot.logger.debug(
                            f"Success with generate api call: {response.status} - {response.reason}")
                    except TypeError:
                        new_message = "There was an error generating my response, please try again later."
                        self.bot.logger.warn(
                            f"Error with generate api call: server returned nothing.")
                else:
                    self.bot.logger.warn(
                        f"Error with generate api call: {response.status} - {response.reason}")
                    new_message = "There was an error generating my response, please try again later."

        new_message_long = f"{message} {new_message}"
        return new_message_long, new_message

    @commands.hybrid_command(name="chat", description="Chat with Agent Kitten.", with_app_command=True)
    async def chat(self, ctx: commands.Context, search: typing.Optional[bool], *, message: str):
        await ctx.defer()
        key = {
            "user-id": str(ctx.author.id)
        }
        user_instructions = await self.collection.find_one(key)
        if user_instructions:
            instruction = user_instructions["instruction"]
        else:
            instruction = self.instructions
        if search:
            search_results = ""
            new_instruction, search_term = await self.generate(f"{instruction}\n\n### User: {message}\n### Search Term:")
            index = 1
            for result in googlesearch.search(search_term, advanced=True, num_results=self.search_results_amount):
                search_results += f", [{index}] \"{result.description}\" ({result.url})"
                index += 1
                if index >= self.search_results_amount + 1:
                    break
            search_results = search_results[2:]
            message_to_input = f"{instruction}\n\n### User: {message}\n### Search Term: {search_term}\n### Search Results: {search_results}\n### Agent Kitten:"
        else:
            message_to_input = f"{instruction}\n\n### User: {message}\n### Search Term: None\n### Search Results: None\n### Agent Kitten:"
        new_instruction, result = await self.generate(message_to_input)
        data = {
            "$set": {
                "instruction": new_instruction
            }
        }
        await self.collection.update_one(key, data, upsert=True)
        embed = discord.Embed(
            title="Response",
            description=result[:4095],
            color=discord.Color.blue(),
            timestamp=datetime.datetime.now()
        ).set_footer(
            text="If the responce doesnt seem right, try repeating your question(s). If it doesn\'t work, use `/chatclear` and retype your question(s). If that doesn\'t work, Report it in my support server with the data from your `/rawchat`."
        ).set_author(
            name=ctx.author.name,
            icon_url=ctx.author.avatar.url
        )
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="chatclear", description="Clear your current conversation with Agent Kitten.",
                             with_app_command=True)
    async def chatclear(self, ctx: commands.Context):
        key = {
            "user-id": str(ctx.author.id)
        }
        await self.collection.delete_one(key)
        await ctx.reply(f"I have deleted your conversation with me, {ctx.author.mention}.")

    @commands.hybrid_command(name="rawchat",
                             description="Check raw conversation data with Agent Kitten. (Meant for debugging)",
                             with_app_command=True)
    async def rawchat(self, ctx: commands.Context):
        key = {
            "user-id": str(ctx.author.id)
        }
        user_instructions = await self.collection.find_one(key)
        if user_instructions:
            instruction = user_instructions["instruction"]
            async with aiofiles.open(f"{ctx.author.id}.txt", mode="wb") as file:
                await file.write(bytes(instruction, 'utf8'))
            await ctx.reply(
                f"Here is my chat data with you, {ctx.author.mention}. Remember, the first three requests are just tests for me to understand my tasks correctly.",
                file=discord.File(f"{ctx.author.id}.txt"))
            os.remove(f"{ctx.author.id}.txt")
        else:
            await ctx.reply(f"I have no chat data with you, {ctx.author.mention}.")


async def setup(bot):
    await bot.add_cog(TextGen(bot))
