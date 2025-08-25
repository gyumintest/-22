const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const ytdl = require('@distube/ytdl-core');
const yts = require('yt-search');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { token } = require('./config.json');

ffmpeg.setFfmpegPath(ffmpegStatic);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages] });
const queue = new Map();

client.once('clientReady', () => {
  console.log('🎵 코딩냥 노래봇 준비 완료! 😺');
  const commands = [
    new SlashCommandBuilder()
      .setName('재생')
      .setDescription('유튜브 URL 또는 검색어로 노래를 재생해요! 😺')
      .addStringOption(option => option.setName('쿼리').setDescription('유튜브 URL 또는 검색어').setRequired(true)),
    new SlashCommandBuilder()
      .setName('검색')
      .setDescription('노래를 검색해 최대 5개 결과를 선택할 수 있어요! 🔍')
      .addStringOption(option => option.setName('쿼리').setDescription('검색어').setRequired(true)),
    new SlashCommandBuilder()
      .setName('재생목록')
      .setDescription('유튜브 재생목록 URL로 여러 곡을 추가해요! 📚')
      .addStringOption(option => option.setName('url').setDescription('유튜브 재생목록 URL').setRequired(true)),
    new SlashCommandBuilder()
      .setName('정지')
      .setDescription('음악을 정지하고 대기열을 초기화해요 😿'),
    new SlashCommandBuilder()
      .setName('스킵')
      .setDescription('현재 노래를 건너뛰어요 ⏭'),
    new SlashCommandBuilder()
      .setName('대기열')
      .setDescription('현재 대기열을 보여줘요 📜'),
    new SlashCommandBuilder()
      .setName('삭제')
      .setDescription('대기열에서 특정 곡을 삭제해요 🗑')
      .addIntegerOption(option => option.setName('번호').setDescription('삭제할 곡 번호').setRequired(true)),
    new SlashCommandBuilder()
      .setName('셔플')
      .setDescription('대기열을 무작위로 섞어요 🔀'),
    new SlashCommandBuilder()
      .setName('볼륨')
      .setDescription('재생 볼륨을 조절해요 (1-100) 🔊')
      .addIntegerOption(option => option.setName('레벨').setDescription('볼륨 레벨 (1-100)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('지금재생')
      .setDescription('현재 재생 중인 노래 정보를 보여줘요 🎶'),
    new SlashCommandBuilder()
      .setName('일시정지')
      .setDescription('노래를 일시정지해요 ⏸'),
    new SlashCommandBuilder()
      .setName('재개')
      .setDescription('일시정지된 노래를 다시 재생해요 ▶'),
    new SlashCommandBuilder()
      .setName('이동')
      .setDescription('노래의 특정 시간으로 이동해요 (초 단위) ⏩')
      .addIntegerOption(option => option.setName('초').setDescription('이동할 시간(초)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('루프')
      .setDescription('곡 또는 대기열 반복을 설정/해제해요 🔁')
      .addStringOption(option =>
        option.setName('모드').setDescription('반복 모드').setRequired(true)
          .addChoices(
            { name: '끄기', value: 'off' },
            { name: '한 곡 반복', value: 'song' },
            { name: '대기열 반복', value: 'queue' }
          )
      ),
    new SlashCommandBuilder()
      .setName('이퀄라이저')
      .setDescription('음질을 조정해요 🎚')
      .addStringOption(option =>
        option.setName('모드').setDescription('이퀄라이저 모드').setRequired(true)
          .addChoices(
            { name: '기본', value: 'default' },
            { name: '베이스 부스트', value: 'bassboost' },
            { name: '팝', value: 'pop' }
          )
      ),
  ];

  client.application.commands.set(commands);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand() && !interaction.isStringSelectMenu()) return;

  const serverQueue = queue.get(interaction.guild?.id);

  if (interaction.isCommand()) {
    const { commandName } = interaction;
    const options = interaction.options;

    if (commandName === '재생') {
      await interaction.deferReply();
      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('음악을 재생하려면 음성 채널에 들어가 있어야 해요!')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }

      const query = options.getString('쿼리');
      let song = null;

      if (ytdl.validateURL(query)) {
        try {
          const songInfo = await ytdl.getInfo(query);
          song = {
            title: songInfo.videoDetails.title,
            url: songInfo.videoDetails.video_url,
            thumbnail: songInfo.videoDetails.thumbnails[0].url,
            duration: parseInt(songInfo.videoDetails.lengthSeconds),
          };
        } catch (err) {
          console.error('ytdl-core error:', err);
          const embed = new EmbedBuilder()
            .setColor('#FF5555')
            .setTitle('😿 오류')
            .setDescription('유튜브 URL을 처리하는 중 오류가 발생했어요. URL이 올바른지 확인해주세요!')
            .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
            .setTimestamp();
          return interaction.followUp({ embeds: [embed] });
        }
      } else {
        try {
          const results = await yts(query);
          const video = results.videos[0];
          if (!video) {
            const embed = new EmbedBuilder()
              .setColor('#FF5555')
              .setTitle('😿 오류')
              .setDescription('검색 결과가 없어요. 다른 검색어를 시도해 보세요!')
              .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
              .setTimestamp();
            return interaction.followUp({ embeds: [embed] });
          }
          song = {
            title: video.title,
            url: video.url,
            thumbnail: video.thumbnail,
            duration: video.duration.seconds,
          };
        } catch (err) {
          console.error('yt-search error:', err);
          const embed = new EmbedBuilder()
            .setColor('#FF5555')
            .setTitle('😿 오류')
            .setDescription('검색 중 오류가 발생했어요.')
            .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
            .setTimestamp();
          return interaction.followUp({ embeds: [embed] });
        }
      }

      if (!serverQueue) {
        const queueConstruct = {
          textChannel: interaction.channel,
          voiceChannel: voiceChannel,
          connection: null,
          songs: [],
          volume: 50,
          playing: true,
          player: null,
          loop: 'off',
          eq: 'default',
          currentTime: 0,
        };

        queue.set(interaction.guild.id, queueConstruct);
        queueConstruct.songs.push(song);

        try {
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
          });
          queueConstruct.connection = connection;
          play(interaction.guild, queueConstruct.songs[0], interaction);
        } catch (err) {
          console.error('Voice connection error:', err);
          queue.delete(interaction.guild.id);
          const embed = new EmbedBuilder()
            .setColor('#FF5555')
            .setTitle('😿 오류')
            .setDescription('음성 채널에 연결할 수 없었어요.')
            .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
            .setTimestamp();
          return interaction.followUp({ embeds: [embed] });
        }
      } else {
        serverQueue.songs.push(song);
        const embed = new EmbedBuilder()
          .setColor('#55FF55')
          .setTitle('🎶 대기열에 추가됨')
          .setDescription(`**${song.title}** (${formatDuration(song.duration)})이(가) 대기열에 추가되었어요!`)
          .setThumbnail(song.thumbnail)
          .addFields(
            { name: '대기열 위치', value: `${serverQueue.songs.length}`, inline: true },
            { name: '길이', value: formatDuration(song.duration), inline: true }
          )
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
    } else if (commandName === '검색') {
      await interaction.deferReply();
      if (!options) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('검색어를 입력해주세요!')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }

      const query = options.getString('쿼리');
      if (!query) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('검색어를 입력해주세요!')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }

      try {
        const results = await yts(query);
        const videos = results.videos.slice(0, 5);
        if (!videos.length) {
          const embed = new EmbedBuilder()
            .setColor('#FF5555')
            .setTitle('😿 오류')
            .setDescription('검색 결과가 없어요. 다른 검색어를 시도해 보세요!')
            .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
            .setTimestamp();
          return interaction.followUp({ embeds: [embed] });
        }

        const selectOptions = videos.map((video, index) => ({
          label: video.title.slice(0, 100),
          value: `${index}`,
          description: `길이: ${formatDuration(video.duration.seconds)}`,
        }));

        const row = new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('select-song')
              .setPlaceholder('노래를 선택하세요! 😺')
              .addOptions(selectOptions)
          );

        const embed = new EmbedBuilder()
          .setColor('#55FF55')
          .setTitle('🔍 검색 결과')
          .setDescription('아래에서 원하는 노래를 선택해주세요!')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        await interaction.followUp({ embeds: [embed], components: [row] });
        const videosMap = new Map(videos.map((video, index) => [index.toString(), video]));
        queue.set(`search_${interaction.id}`, { videosMap, voiceChannel: interaction.member?.voice?.channel });
      } catch (err) {
        console.error('yt-search error:', err);
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('검색 중 오류가 발생했어요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
    } else if (commandName === '재생목록') {
      await interaction.deferReply();
      const url = options.getString('url');
      if (!url.includes('list=')) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('올바른 유튜브 재생목록 URL을 입력해주세요!')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }

      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('음악을 재생하려면 음성 채널에 들어가 있어야 해요!')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }

      try {
        const playlist = await yts({ listId: url.split('list=')[1] });
        const songs = playlist.videos.map(video => ({
          title: video.title,
          url: video.url,
          thumbnail: video.thumbnail,
          duration: video.duration.seconds,
        }));

        if (!songs.length) {
          const embed = new EmbedBuilder()
            .setColor('#FF5555')
            .setTitle('😿 오류')
            .setDescription('재생목록에 노래가 없어요.')
            .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
            .setTimestamp();
          return interaction.followUp({ embeds: [embed] });
        }

        if (!serverQueue) {
          const queueConstruct = {
            textChannel: interaction.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 50,
            playing: true,
            player: null,
            loop: 'off',
            eq: 'default',
            currentTime: 0,
          };

          queue.set(interaction.guild.id, queueConstruct);
          queueConstruct.songs.push(...songs);

          try {
            const connection = joinVoiceChannel({
              channelId: voiceChannel.id,
              guildId: interaction.guild.id,
              adapterCreator: interaction.guild.voiceAdapterCreator,
            });
            queueConstruct.connection = connection;
            play(interaction.guild, queueConstruct.songs[0], interaction);
          } catch (err) {
            console.error('Voice connection error:', err);
            queue.delete(interaction.guild.id);
            const embed = new EmbedBuilder()
              .setColor('#FF5555')
              .setTitle('😿 오류')
              .setDescription('음성 채널에 연결할 수 없었어요.')
              .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
              .setTimestamp();
            return interaction.followUp({ embeds: [embed] });
          }
        } else {
          serverQueue.songs.push(...songs);
          const embed = new EmbedBuilder()
            .setColor('#55FF55')
            .setTitle('📚 재생목록 추가됨')
            .setDescription(`**${playlist.title}**에서 ${songs.length}곡이 대기열에 추가되었어요!`)
            .setThumbnail(songs[0].thumbnail)
            .addFields(
              { name: '총 곡 수', value: `${serverQueue.songs.length}`, inline: true },
              { name: '첫 곡', value: songs[0].title, inline: true }
            )
            .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
            .setTimestamp();
          return interaction.followUp({ embeds: [embed] });
        }
      } catch (err) {
        console.error('yt-search playlist error:', err);
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('재생목록을 처리하는 중 오류가 발생했어요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
    } else if (commandName === '정지') {
      await interaction.deferReply();
      if (!serverQueue) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('재생 중인 음악이 없어요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      serverQueue.songs = [];
      serverQueue.connection.destroy();
      queue.delete(interaction.guild.id);
      const embed = new EmbedBuilder()
        .setColor('#FFAA00')
        .setTitle('⏹ 정지됨')
        .setDescription('음악이 정지되고 대기열이 초기화되었어요!')
        .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    } else if (commandName === '스킵') {
      await interaction.deferReply();
      if (!serverQueue) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('건너뛸 노래가 없어요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      serverQueue.player.stop();
      const embed = new EmbedBuilder()
        .setColor('#FFAA00')
        .setTitle('⏭ 스킵됨')
        .setDescription('현재 노래를 건너뛰었어요!')
        .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    } else if (commandName === '삭제') {
      await interaction.deferReply();
      if (!serverQueue || !serverQueue.songs.length) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('대기열이 비어 있어요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      const index = options.getInteger('번호') - 1;
      if (index < 0 || index >= serverQueue.songs.length) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription(`유효한 곡 번호를 입력해주세요 (1~${serverQueue.songs.length}).`)
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      const removedSong = serverQueue.songs.splice(index, 1)[0];
      const embed = new EmbedBuilder()
        .setColor('#FFAA00')
        .setTitle('🗑 곡 삭제')
        .setDescription(`**${removedSong.title}**이(가) 대기열에서 삭제되었어요!`)
        .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    } else if (commandName === '셔플') {
      await interaction.deferReply();
      if (!serverQueue || serverQueue.songs.length < 2) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('셔플하려면 대기열에 최소 2곡이 필요해요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      const currentSong = serverQueue.songs.shift();
      for (let i = serverQueue.songs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [serverQueue.songs[i], serverQueue.songs[j]] = [serverQueue.songs[j], serverQueue.songs[i]];
      }
      serverQueue.songs.unshift(currentSong);
      const embed = new EmbedBuilder()
        .setColor('#55FF55')
        .setTitle('🔀 대기열 셔플')
        .setDescription('대기열이 무작위로 섞였어요! 😺')
        .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    } else if (commandName === '대기열') {
      await interaction.deferReply();
      if (!serverQueue || !serverQueue.songs.length) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('📜 대기열')
          .setDescription('대기열이 비어 있어요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      const queueList = serverQueue.songs.slice(0, 10).map((song, i) => `${i + 1}. **${song.title}** (${formatDuration(song.duration)})`).join('\n');
      const embed = new EmbedBuilder()
        .setColor('#55FF55')
        .setTitle('📜 코딩냥 대기열')
        .setDescription(`**현재 재생 중**: ${serverQueue.songs[0].title}\n\n**대기열 목록**:\n${queueList}`)
        .setThumbnail(serverQueue.songs[0].thumbnail)
        .addFields(
          { name: '총 곡 수', value: `${serverQueue.songs.length}`, inline: true },
          { name: '반복 모드', value: serverQueue.loop === 'song' ? '한 곡 반복' : serverQueue.loop === 'queue' ? '대기열 반복' : '꺼짐', inline: true },
          { name: '이퀄라이저', value: serverQueue.eq, inline: true }
        )
        .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    } else if (commandName === '볼륨') {
      await interaction.deferReply();
      if (!serverQueue) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('재생 중인 음악이 없어요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      const volume = options.getInteger('레벨');
      if (volume < 1 || volume > 100) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('볼륨은 1~100 사이로 설정해주세요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      serverQueue.volume = volume;
      if (serverQueue.player._state.resource) {
        serverQueue.player._state.resource.volume.setVolume(volume / 100);
      }
      const embed = new EmbedBuilder()
        .setColor('#55FF55')
        .setTitle('🔊 볼륨 조절')
        .setDescription(`볼륨이 **${volume}%**로 설정되었어요! 😺`)
        .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    } else if (commandName === '지금재생') {
      await interaction.deferReply();
      if (!serverQueue || !serverQueue.songs[0]) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('현재 재생 중인 노래가 없어요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      const song = serverQueue.songs[0];
      const progressBar = createProgressBar(serverQueue.currentTime, song.duration);
      const embed = new EmbedBuilder()
        .setColor('#55FF55')
        .setTitle('🎵 지금 재생 중')
        .setDescription(`**${song.title}**\n${progressBar}\n길이: ${formatDuration(song.duration)}\n현재: ${formatDuration(serverQueue.currentTime)}\n볼륨: ${serverQueue.volume}%\n반복: ${serverQueue.loop === 'song' ? '한 곡 반복' : serverQueue.loop === 'queue' ? '대기열 반복' : '꺼짐'}\n이퀄라이저: ${serverQueue.eq}`)
        .setThumbnail(song.thumbnail)
        .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    } else if (commandName === '일시정지') {
      await interaction.deferReply();
      if (!serverQueue || !serverQueue.player) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('재생 중인 노래가 없어요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      serverQueue.player.pause();
      const embed = new EmbedBuilder()
        .setColor('#FFAA00')
        .setTitle('⏸ 일시정지')
        .setDescription('노래가 일시정지되었어요! 😸')
        .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    } else if (commandName === '재개') {
      await interaction.deferReply();
      if (!serverQueue || !serverQueue.player) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('재생 중인 노래가 없어요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      serverQueue.player.unpause();
      const embed = new EmbedBuilder()
        .setColor('#55FF55')
        .setTitle('▶ 재개')
        .setDescription('노래 재생을 재개했어요! 😺')
        .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    } else if (commandName === '이동') {
      await interaction.deferReply();
      if (!serverQueue || !serverQueue.songs[0]) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('재생 중인 노래가 없어요.')
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      const seconds = options.getInteger('초');
      if (seconds < 0 || seconds >= serverQueue.songs[0].duration) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription(`이동 시간은 0~${serverQueue.songs[0].duration}초 사이여야 해요.`)
          .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      serverQueue.currentTime = seconds;
      play(interaction.guild, serverQueue.songs[0], interaction, seconds);
      const embed = new EmbedBuilder()
        .setColor('#55FF55')
        .setTitle('⏩ 시간 이동')
        .setDescription(`노래를 ${formatDuration(seconds)}로 이동했어요! 😺`)
        .setFooter({ text: '코딩냥 노래봇', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    } else if (commandName === '루프') {
      await interaction.deferReply();
      if (!serverQueue) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('재생 중인 음악이 없어요.')
          .setFooter({ text: '코딩냥 노래봇 Nekocoding#1234', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      const mode = options.getString('모드');
      serverQueue.loop = mode;
      const modeText = mode === 'song' ? '한 곡 반복' : mode === 'queue' ? '대기열 반복' : '꺼짐';
      const embed = new EmbedBuilder()
        .setColor('#55FF55')
        .setTitle('🔁 반복 설정')
        .setDescription(`반복 모드가 **${modeText}**으로 설정되었어요! 😺`)
        .addFields({ name: '현재 곡', value: serverQueue.songs[0].title, inline: true })
        .setFooter({ text: '코딩냥 노래봇 Nekocoding#1234', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    } else if (commandName === '이퀄라이저') {
      await interaction.deferReply();
      if (!serverQueue) {
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('재생 중인 음악이 없어요.')
          .setFooter({ text: '코딩냥 노래봇 Nekocoding#1234', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
      const mode = options.getString('모드');
      serverQueue.eq = mode;
      play(interaction.guild, serverQueue.songs[0], interaction, serverQueue.currentTime);
      const embed = new EmbedBuilder()
        .setColor('#55FF55')
        .setTitle('🎚 이퀄라이저 설정')
        .setDescription(`이퀄라이저가 **${mode}** 모드로 설정되었어요! 😺`)
        .addFields({ name: '현재 곡', value: serverQueue.songs[0].title, inline: true })
        .setFooter({ text: '코딩냥 노래봇 Nekocoding#1234', iconURL: client.user.avatarURL() })
        .setTimestamp();
      interaction.followUp({ embeds: [embed] });
    }
  } else if (interaction.isStringSelectMenu() && interaction.customId === 'select-song') {
    await interaction.deferReply();
    const searchData = queue.get(`search_${interaction.message?.interaction?.id}`);
    if (!searchData) {
      const embed = new EmbedBuilder()
        .setColor('#FF5555')
        .setTitle('😿 오류')
        .setDescription('검색 데이터가 만료되었어요. 다시 검색해주세요!')
        .setFooter({ text: '코딩냥 노래봇 Nekocoding#1234', iconURL: client.user.avatarURL() })
        .setTimestamp();
      return interaction.followUp({ embeds: [embed] });
    }

    const { videosMap, voiceChannel } = searchData;
    const selectedIndex = interaction.values[0];
    const video = videosMap.get(selectedIndex);
    if (!video) {
      const embed = new EmbedBuilder()
        .setColor('#FF5555')
        .setTitle('😿 오류')
        .setDescription('선택한 노래를 찾을 수 없어요.')
        .setFooter({ text: '코딩냥 노래봇 Nekocoding#1234', iconURL: client.user.avatarURL() })
        .setTimestamp();
      return interaction.followUp({ embeds: [embed] });
    }

    const song = {
      title: video.title,
      url: video.url,
      thumbnail: video.thumbnail,
      duration: video.duration.seconds,
    };

    if (!serverQueue) {
      const queueConstruct = {
        textChannel: interaction.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        volume: 50,
        playing: true,
        player: null,
        loop: 'off',
        eq: 'default',
        currentTime: 0,
      };

      queue.set(interaction.guild.id, queueConstruct);
      queueConstruct.songs.push(song);

      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
        });
        queueConstruct.connection = connection;
        play(interaction.guild, queueConstruct.songs[0], interaction);
      } catch (err) {
        console.error('Voice connection error:', err);
        queue.delete(interaction.guild.id);
        const embed = new EmbedBuilder()
          .setColor('#FF5555')
          .setTitle('😿 오류')
          .setDescription('음성 채널에 연결할 수 없었어요.')
          .setFooter({ text: '코딩냥 노래봇 Nekocoding#1234', iconURL: client.user.avatarURL() })
          .setTimestamp();
        return interaction.followUp({ embeds: [embed] });
      }
    } else {
      serverQueue.songs.push(song);
      const embed = new EmbedBuilder()
        .setColor('#55FF55')
        .setTitle('🎶 대기열에 추가됨')
        .setDescription(`**${song.title}** (${formatDuration(song.duration)})이(가) 대기열에 추가되었어요!`)
        .setThumbnail(song.thumbnail)
        .addFields(
          { name: '대기열 위치', value: `${serverQueue.songs.length}`, inline: true },
          { name: '길이', value: formatDuration(song.duration), inline: true }
        )
        .setFooter({ text: '코딩냥 노래봇 Nekocoding#1234', iconURL: client.user.avatarURL() })
        .setTimestamp();
      return interaction.followUp({ embeds: [embed] });
    }
    queue.delete(`search_${interaction.message?.interaction?.id}`);
  }
});

function createProgressBar(current, total) {
  const barLength = 20;
  const filled = Math.round((current / total) * barLength);
  return '🔵' + '━'.repeat(filled) + '┄'.repeat(barLength - filled) + ` ${formatDuration(current)} / ${formatDuration(total)}`;
}

function applyEqFilter(stream, eqMode) {
  let filter = [];
  switch (eqMode) {
    case 'bassboost':
      filter = ['bass=g=10'];
      break;
    case 'pop':
      filter = ['equalizer=f=1000:width_type=h:w=200:g=5'];
      break;
    default:
      filter = [];
  }
  return filter.length ? ffmpeg(stream).audioFilters(filter).format('mp3') : stream;
}

function play(guild, song, interaction, seek = 0) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  const player = createAudioPlayer();
  let stream;
  try {
    stream = ytdl(song.url, { filter: 'audioonly', highWaterMark: 1 << 25, quality: 'highestaudio' });
  } catch (err) {
    console.error('ytdl stream error:', err);
    const embed = new EmbedBuilder()
      .setColor('#FF5555')
      .setTitle('😿 오류')
      .setDescription('노래 스트리밍 중 오류가 발생했어요. 다른 URL을 시도해주세요!')
      .setFooter({ text: '코딩냥 노래봇 Nekocoding#1234', iconURL: client.user.avatarURL() })
      .setTimestamp();
    interaction.followUp({ embeds: [embed] });
    return;
  }

  const filteredStream = applyEqFilter(stream, serverQueue.eq);
  const resource = createAudioResource(filteredStream, { inlineVolume: true, seek });
  resource.volume.setVolume(serverQueue.volume / 100);
  serverQueue.player = player;
  serverQueue.connection.subscribe(player);
  serverQueue.currentTime = seek;
  player.play(resource);

  const progressInterval = setInterval(() => {
    if (player.state.status === AudioPlayerStatus.Playing) {
      serverQueue.currentTime += 1;
    }
  }, 1000);

  player.on('stateChange', (oldState, newState) => {
    if (newState.status === 'idle') {
      clearInterval(progressInterval);
      if (serverQueue.loop === 'song') {
        play(guild, serverQueue.songs[0], interaction);
      } else if (serverQueue.loop === 'queue') {
        serverQueue.songs.push(serverQueue.songs.shift());
        play(guild, serverQueue.songs[0], interaction);
      } else {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0], interaction);
      }
    }
  }).on('error', error => {
    console.error('Player error:', error);
    clearInterval(progressInterval);
    serverQueue.textChannel.send('재생 중 오류가 발생했어요. 😿');
  });

  const embed = new EmbedBuilder()
    .setColor('#55FF55')
    .setTitle('🎵 지금 재생 중')
    .setDescription(`**${song.title}**\n${createProgressBar(seek, song.duration)}\n길이: ${formatDuration(song.duration)}\n볼륨: ${serverQueue.volume}%\n반복: ${serverQueue.loop === 'song' ? '한 곡 반복' : serverQueue.loop === 'queue' ? '대기열 반복' : '꺼짐'}\n이퀄라이저: ${serverQueue.eq}`)
    .setThumbnail(song.thumbnail)
    .setFooter({ text: '코딩냥 노래봇 Nekocoding#1234', iconURL: client.user.avatarURL() })
    .setTimestamp();
  interaction.followUp({ embeds: [embed] });
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours ? `${hours}:` : ''}${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("봇이 살아있습니다! 🟢");
});

app.listen(3000, () => {
  console.log("🌐 상태 서버 실행됨 (포트 3000)");
});

client.login(token);