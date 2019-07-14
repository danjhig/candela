/** @typedef { import('discord.js') } Guild */
/** @typedef { import('discord.js').Message } Message */
/** @typedef { import('discord.js').Role } Role */
/** @typedef { import('discord.js').TextChannel } TextChannel */

const Discord = require('discord.js')
const client = new Discord.Client()

const GYM_MEMBERSHIP = 'gym-membership'
const WELCOME_MESSAGE = 'Hi Trainers! Candela here.'
const SUBSCRIBE_EMOJI = '🔔'
const UNSUBSCRIBE_EMOJI = '🔕'

client.on('ready', () => {
  client.guilds.tap(guild => initGuild(guild))
  console.log('Ready.')
})

client.on('guildCreate', guild => {
  initGuild(guild)
})

client.on('message', async message => {
  if (!shouldListen(message) || (message.author.id === client.user.id)) {
    return
  }
  await message.delete()
  if (!message.member.hasPermission('ADMINISTRATOR')) {
    await message.author.send(
      `Oops, sorry! You don't have permission to create gyms in **${message.guild.name}**. ` +
      `Only administrators can do that!`
    )
    return
  }
  const gyms = message.content.split('\n').map(name => name.trim())
  for (const gym of gyms) {
    const role = await getOrCreateGymRole(message.guild, gym)
    if (role.mentionable) {
      const roleMessage = await message.channel.send(`<@&${role.id}>`)
      await roleMessage.react(SUBSCRIBE_EMOJI)
      await roleMessage.react(UNSUBSCRIBE_EMOJI)
    } else {
      await message.channel.send(
        `Hmm. A role called **${gym}** already exists and is not mentionable. ` +
        `If you're sure that you  want to add a gym with that name, ` +
        `either delete that role or make it mentionable then try me again.`
      )
    }
  }
})

/**
 * @param {Guild} guild
 */
async function initGuild (guild) {
  const gymMembershipChannel = await getOrCreateGymMembershipChannel(guild)
  // Fetching messages has the important side effect of caching old gym messages.
  const messages = await gymMembershipChannel.fetchMessages()
  const candelaMessages = messages.filter(message => message.author.id === client.user.id)
  if (candelaMessages.size === 0) {
    gymMembershipChannel.send(WELCOME_MESSAGE)
  }
}

/**
 * @param {Guild} guild
 * @returns {TextChannel}
 */
async function getOrCreateGymMembershipChannel (guild) {
  const channel = guild.channels.find(channel => channel.name === GYM_MEMBERSHIP)
  if (channel) {
    return channel
  } else {
    const botOnlyPermissions = ['SEND_MESSAGES', 'ADD_REACTIONS']
    return guild.createChannel(GYM_MEMBERSHIP, {
      permissionOverwrites: [
        { id: guild.id, deny: botOnlyPermissions },
        { id: client.user.id, allow: botOnlyPermissions }
      ]
    })
  }
}

/**
 * @param {Guild} guild
 * @param {string} gym
 * @returns {Role}
 */
async function getOrCreateGymRole (guild, gym) {
  const role = guild.roles.find(role => role.name === gym)
  if (role) {
    return role
  } else {
    return guild.createRole({
      name: gym,
      mentionable: true,
      permissions: 0
    })
  }
}

/**
 * @param {Message} message
 * @returns {boolean}
 */
function shouldListen (message) {
  const { channel } = message
  if ((channel.type !== 'text') || (channel.name !== GYM_MEMBERSHIP)) {
    return false
  }
  const isProduction = this.process.env.ENV === 'production'
  const isTestGuild = message.guild && (message.guild.id === this.process.env.TEST_GUILD)
  return (isProduction && !isTestGuild) || (!isProduction && isTestGuild)
}

client.login(process.env.TOKEN)
