use crate::{Context, Error};
use chrono::Utc;
use human_bytes::human_bytes;
use poise::serenity_prelude as serenity;
use serenity::builder::CreateEmbed;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate};

/// Convert milliseconds to the largest appropriate unit
fn convert_millis_to_human_readable(millis: i64) -> String {
    let units = [
        ("day", 24 * 60 * 60 * 1000),
        ("hour", 60 * 60 * 1000),
        ("minute", 60 * 1000),
        ("second", 1000),
    ];
    for &(name, value) in &units {
        if millis >= value {
            let amount = millis / value;
            return format!("{} {}{}", amount, name, if amount != 1 { "s" } else { "" });
        }
    }
    "less than a second".into()
}

/// Get some information about the bot and how well it is performing
#[poise::command(slash_command)]
pub async fn debug(ctx: Context<'_>) -> Result<(), Error> {
    // Compute bot latency
    let latency_ms = ctx.ping().await;

    // Compute uptime
    let now = Utc::now();
    let uptime = (now - ctx.data().start_time).num_milliseconds();
    let uptime_str = convert_millis_to_human_readable(uptime);

    use sysinfo::System;
    let mut sys = System::new_all();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_cpu(),
    );
    let current_process = sys
        .process(sysinfo::get_current_pid()?)
        .expect("Failed to get current process");
    let heap = current_process.virtual_memory();
    let memory_usage = human_bytes(heap as f64);
    let cpu_usage = current_process.cpu_usage();
    let shard_id = ctx.serenity_context().shard_id;
    let amount_users = ctx.serenity_context().cache.user_count();
    let amount_guilds = ctx.serenity_context().cache.guild_count();

    // Build the embed
    let embed = CreateEmbed::default()
        .title("Debug Information")
        .color(0x9A2D7D)
        .timestamp(Utc::now())
        .field("Bot Latency", format!("{latency_ms:#?}"), true)
        .field("Bot Uptime", uptime_str, true)
        .field("Bot Version", env!("CARGO_PKG_VERSION"), true)
        .field("Bot Owner", "<@!1208479777900470344>", true)
        .field(
            "Bot Administrators",
            "<@!1208479777900470344>, <@!1250923829761675336>",
            true,
        )
        .field(
            "Bot Developers",
            "<@!1250923829761675336>, <@!1045011641940574208>, \
            <@!750805129116123157>, <@!801384603704623115>",
            true,
        )
        .field(
            "Bot Contributors",
            "<@!1139185365597573180>, <@!879313965790920764>",
            true,
        )
        .field("User Count", amount_users.to_string(), true)
        .field("Guild Count", amount_guilds.to_string(), true)
        .field("Current Shard ID", shard_id.to_string(), true)
        .field("Memory Usage", memory_usage, true)
        .field("CPU Usage", format!("{} Cores", cpu_usage / 100.0), true);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}
