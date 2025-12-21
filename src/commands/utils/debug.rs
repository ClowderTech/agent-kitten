use crate::{Context, Error};
use chrono::Utc;
use poise::serenity_prelude as serenity;
use serenity::builder::CreateEmbed;

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

/// Format a byte count into KB/MB/etc.
fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".into();
    }
    let sizes = ["B", "KiB", "MiB", "GiB", "TiB"];
    let i = (bytes as f64).log(1024.0).floor() as usize;
    let val = bytes as f64 / 1024f64.powi(i as i32);
    format!("{:.2} {}", val, sizes[i])
}

#[poise::command(slash_command, prefix_command)]
pub async fn debug(ctx: Context<'_>) -> Result<(), Error> {
    // Compute bot latency
    let latency_ms = ctx.ping().await;

    // Compute uptime
    let now = Utc::now();
    let uptime = (now - ctx.data().start_time).num_milliseconds();
    let uptime_str = convert_millis_to_human_readable(uptime);

    use sysinfo::System;
    let mut sys = System::new_all();
    let current_process_id = sysinfo::get_current_pid().expect("Failed to get current process ID");
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_all();
    let current_process = sys
        .process(current_process_id)
        .expect("Failed to get current process");
    let heap = current_process.memory();
    let memory_usage = format_bytes(heap);
    let cpu_usage = current_process.cpu_usage() / 100.0;

    // Build the embed
    let embed = CreateEmbed::default()
        .title("Debug Information")
        .color(0x9A2D7D)
        .timestamp(Utc::now())
        .field("Bot Latency", format!("{latency_ms:#?}"), true)
        .field("Bot Uptime", uptime_str, true)
        .field("Bot Version", "3.0.2", true)
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
        // .field(
        //     "User Count",
        //     // approximate user installs or fallback to cache size
        //     format!("{}", ctx.serenity_context().cache.user_count()),
        //     true
        // )
        .field("Memory Usage", memory_usage, true)
        .field("CPU Usage", format!("{cpu_usage} Cores"), true);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}
